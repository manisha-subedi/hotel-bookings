import duckdb
import pytest


@pytest.fixture(scope="module")
def con():
    return duckdb.connect("hotel.duckdb", read_only=True)


def one(con, sql):
    return con.execute(sql).fetchone()[0]


def test_every_booking_is_in_the_fact_table(con):
    assert one(con, "select count(*) from fact_booking") == 119390


def test_dates_have_no_gaps(con):
    lo, hi, n = con.execute("select min(date), max(date), count(*) from dim_date").fetchone()
    assert (hi - lo).days + 1 == n
    assert one(con, "select count(*) - count(distinct date_key) from dim_date") == 0


def test_every_key_resolves(con):
    for col, dim in [("arrival_date_key", "dim_date"), ("status_date_key", "dim_date"),
                     ("hotel_key", "dim_hotel"), ("customer_key", "dim_customer"), ("channel_key", "dim_channel")]:
        key = "date_key" if dim == "dim_date" else col
        missing = one(con, f"select count(*) from fact_booking f left join {dim} d on d.{key} = f.{col} where d.{key} is null")
        assert missing == 0, f"{col} has {missing} rows with no match in {dim}"


def test_one_night_row_per_occupied_room_night(con):
    expected = one(con, "select sum(nights) from fact_booking where not is_cancelled")
    assert one(con, "select count(*) from fact_night") == expected


def test_rooms_is_the_busiest_night(con):
    for hotel_key, rooms in con.execute("select hotel_key, rooms from dim_hotel").fetchall():
        peak = one(con, f"select max(c) from (select date_key, count(*) c from fact_night where hotel_key = {hotel_key} group by 1)")
        assert rooms == peak


def test_occupancy_uses_inventory_not_booked_nights(con):
    # the wrong formula, sold / sold, is always 100 percent. ours must not be.
    assert one(con, "select max(occupancy) from kpi_hotel_month where year_month < '2017-09'") < 1
    assert one(con, "select min(occupancy) from kpi_hotel_month") > 0


def test_revpar_is_adr_times_occupancy(con):
    worst = one(con, "select max(abs(revpar - adr * occupancy)) from kpi_hotel_month")
    assert worst < 1e-6


def test_headline_numbers(con):
    assert round(100 * one(con, "select avg(is_cancelled::int) from fact_booking"), 1) == 37.0
    assert round(100 * one(con, "select avg(is_cancelled::int) from fact_booking where lead_bucket = '181+'"), 1) == 57.0
