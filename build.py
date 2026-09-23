"""Build the warehouse and the numbers the page reads. Run: python build.py"""

import json
import urllib.request
from pathlib import Path

import duckdb

DATA = Path("data/hotels.csv")
URL = "https://raw.githubusercontent.com/rfordatascience/tidytuesday/master/data/2020/2020-02-11/hotels.csv"
DB = "hotel.duckdb"
OUT = Path("site/data")
LEAD_ORDER = ["0-7", "8-30", "31-90", "91-180", "181+"]


def fetch():
    if DATA.exists():
        return
    DATA.parent.mkdir(exist_ok=True)
    print(f"downloading {DATA.name}")
    urllib.request.urlretrieve(URL, DATA)


def build(con):
    for path in sorted(Path("sql").glob("*.sql")):
        con.execute(path.read_text())
        print(f"ran {path.name}")


def rows(con, sql, params=()):
    result = con.execute(sql, params)
    cols = [d[0] for d in result.description]
    return [dict(zip(cols, r)) for r in result.fetchall()]


def export(con):
    OUT.mkdir(parents=True, exist_ok=True)

    hotels = rows(con, """
        select h.hotel_key, h.hotel_name, h.location, h.rooms,
               count(*) as bookings,
               sum(case when f.is_cancelled then 1 else 0 end) as cancelled,
               sum(f.revenue) as revenue,
               (select count(*) from fact_night n where n.hotel_key = h.hotel_key) as room_nights
        from fact_booking f join dim_hotel h using (hotel_key)
        group by 1, 2, 3, 4 order by 1
    """)

    monthly = rows(con, """
        with arrivals as (
            select f.hotel_key, d.year_month,
                   count(*) as bookings,
                   sum(case when f.is_cancelled then 1 else 0 end) as cancelled
            from fact_booking f join dim_date d on d.date_key = f.arrival_date_key
            group by 1, 2
        )
        select k.hotel_key, k.year_month, k.rooms_available, k.rooms_sold, k.revenue,
               k.occupancy, k.adr, k.revpar, a.bookings, a.cancelled
        from kpi_hotel_month k join arrivals a using (hotel_key, year_month)
        where k.year_month < '2017-09'
        order by 1, 2
    """)

    def grouped(col, table="fact_booking f", join="", order=None):
        data = rows(con, f"""
            select f.hotel_key, {col} as label,
                   count(*) as bookings,
                   sum(case when f.is_cancelled then 1 else 0 end) as cancelled
            from {table} {join}
            group by 1, 2 order by 1, 3 desc
        """)
        if order:
            data.sort(key=lambda r: (r["hotel_key"], order.index(r["label"])))
        return data

    lead = grouped("f.lead_bucket", order=LEAD_ORDER)
    deposit = grouped("f.deposit_type")
    segments = grouped("ch.segment_group", join="join dim_channel ch using (channel_key)")
    customers = grouped("c.customer_type || case when c.is_repeated_guest then ', repeat' else ', new' end",
                        join="join dim_customer c using (customer_key)")
    countries = rows(con, """
        select * from (
            select f.hotel_key, c.country as label, count(*) as bookings,
                   row_number() over (partition by f.hotel_key order by count(*) desc) as rank
            from fact_booking f join dim_customer c using (customer_key)
            where not f.is_cancelled
            group by 1, 2
        ) where rank <= 8 order by hotel_key, rank
    """)

    lookup = rows(con, """
        select f.hotel_key, f.lead_bucket, f.deposit_type, ch.segment_group,
               c.is_repeated_guest as repeated,
               count(*) as n,
               sum(case when f.is_cancelled then 1 else 0 end) as cancelled
        from fact_booking f
        join dim_channel ch using (channel_key)
        join dim_customer c using (customer_key)
        group by 1, 2, 3, 4, 5
    """)

    # of the bookings still on the books N days before arrival, how many still cancelled
    late = []
    for days in (1, 3, 7, 14, 30):
        for r in rows(con, """
            select f.hotel_key, count(*) as on_books,
                   sum(case when f.is_cancelled then 1 else 0 end) as cancelled
            from fact_booking f join dim_date d on d.date_key = f.status_date_key
            where not f.is_cancelled or d.date > f.arrival_date - ?
            group by 1 order by 1
        """, [days]):
            late.append({"days": days, **r})

    adr = {r["hotel_key"]: r["adr"] for r in rows(con, """
        select hotel_key, sum(adr) / count(*) as adr from fact_night group by 1
    """)}
    for h in hotels:
        h["adr"] = adr[h["hotel_key"]]

    (OUT / "summary.json").write_text(json.dumps({"hotels": hotels, "lead_order": LEAD_ORDER, "late": late}, indent=1, default=str))
    (OUT / "monthly.json").write_text(json.dumps(monthly, default=str))
    (OUT / "breakdowns.json").write_text(json.dumps({
        "lead": lead, "deposit": deposit, "segments": segments,
        "customers": customers, "countries": countries,
    }, default=str))
    (OUT / "lookup.json").write_text(json.dumps(lookup, default=str))
    print(f"wrote {len(list(OUT.glob('*.json')))} files to {OUT}")


def export_powerbi(con):
    """Six csv files for Power BI. The star schema, one file per table."""
    out = Path("powerbi/data")
    out.mkdir(parents=True, exist_ok=True)
    con.execute("""
        create or replace view pbi_fact_booking as
        select f.*, d.date as status_date
        from fact_booking f join dim_date d on d.date_key = f.status_date_key
    """)
    tables = {
        "dim_date": "dim_date", "dim_hotel": "dim_hotel", "dim_customer": "dim_customer",
        "dim_channel": "dim_channel", "fact_booking": "pbi_fact_booking", "fact_night": "fact_night",
    }
    for name, source in tables.items():
        con.execute(f"copy (select * from {source}) to '{out / name}.csv' (header, delimiter ',')")
    print(f"wrote {len(tables)} csv files to {out}")


def report(con):
    q = lambda s: con.execute(s).fetchone()
    print()
    print("bookings:", q("select count(*) from fact_booking")[0])
    print("cancelled: %.1f%%" % (100 * q("select avg(is_cancelled::int) from fact_booking")[0]))
    print("cancelled, lead 181+: %.1f%%" % (100 * q("select avg(is_cancelled::int) from fact_booking where lead_bucket = '181+'")[0]))
    print("cancelled, repeat guests: %.1f%%" % (100 * q("select avg(f.is_cancelled::int) from fact_booking f join dim_customer c using (customer_key) where c.is_repeated_guest")[0]))
    for name, pct in con.execute("""
        select h.hotel_name, round(100.0 * avg(f.is_cancelled::int), 1)
        from fact_booking f join dim_hotel h using (hotel_key) join dim_date d on d.date_key = f.status_date_key
        where not f.is_cancelled or d.date > f.arrival_date - 7 group by 1 order by 1
    """).fetchall():
        print(f"{name}: {pct}% of bookings still on the books 7 days before arrival cancelled")
    for name, rooms in con.execute("select hotel_name, rooms from dim_hotel").fetchall():
        print(f"{name}: {rooms} rooms (estimated from the busiest night)")


def main():
    fetch()
    con = duckdb.connect(DB)
    build(con)
    export(con)
    export_powerbi(con)
    report(con)


if __name__ == "__main__":
    main()
