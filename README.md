# Two hotels, 119,390 bookings

Live page: https://manisha-subedi.github.io/hotel-bookings/

This is real booking data from two hotels in Portugal. One is a resort in the
Algarve, the other is a city hotel in Lisbon. The data covers three years,
from July 2015 to August 2017.

I made three things from it:

1. The numbers a hotel manager checks every month. Occupancy, ADR, RevPAR,
   bookings by segment, and cancellations by lead time and deposit.
2. A small tool. You say four things about a booking, and it tells you how
   often bookings like that were cancelled.
3. An overbooking tool. It tells the hotel how many extra rooms it can sell,
   and why.

```
bookings: 119390
cancelled: 37.0%
cancelled, lead 181+: 57.0%
City Hotel: 8.5% of bookings still on the books 7 days before arrival cancelled
Resort Hotel: 4.8% of bookings still on the books 7 days before arrival cancelled
City Hotel: 226 rooms (estimated from the busiest night)
Resort Hotel: 187 rooms (estimated from the busiest night)
```

## How to run it

```bash
uv venv && uv pip install -e ".[dev]"
python build.py
pytest
python -m http.server --directory site
```

`build.py` downloads the CSV, builds the tables in `hotel.duckdb`, and writes
four small JSON files to `site/data/`. The page reads those files and draws
the charts. There is no server and no model.

## The tables

The data comes as one flat table with 32 columns. The files in `sql/` turn it
into a star schema. They run in order, one file per table.

| Table | Rows | What it is |
|---|---|---|
| `dim_date` | 1,064 | every day from the first status date to the last departure, no gaps |
| `dim_hotel` | 2 | hotel, location, and the room count |
| `dim_customer` | 448 | country, customer type, new or repeat guest |
| `dim_channel` | 26 | market segment and distribution channel |
| `fact_booking` | 119,390 | one row per booking |
| `fact_night` | 255,040 | one row per occupied room night |
| `kpi_hotel_month` | 54 | occupancy, ADR, RevPAR per hotel per month |

The bookings table points at the date table two times. Once for the arrival
date, and once for the day the booking was cancelled.

## The room count

The data does not say how many rooms each hotel has. So I estimated it. I
looked for the night with the most rooms occupied. That gives 226 rooms for
the city hotel and 187 for the resort.

Occupancy is rooms sold divided by rooms available. Rooms available is the
room count times the days in the month. A common mistake is to divide by
booked nights instead. That gives 100 percent every month. There is a test
that fails if occupancy ever reaches 100 percent.

## The late cancellation rate

37 percent of all bookings cancel. But most of them cancel weeks before
arrival, and the hotel sells the room again. For overbooking, the rate that
matters is different. It is how many bookings that are still active a few
days before arrival still cancel or do not show up.

`build.py` computes this for 1, 3, 7, 14, and 30 days before arrival. The
overbooking tool uses it as the default.

## The overbooking tool

For each number of extra bookings, the tool assumes each booking cancels on
its own with the rate you set. It works out the chance of each number of
guests showing up. Then it adds up the expected cost of empty rooms and of
guests sent away. The lowest expected cost is the answer. It is about 20
lines in `site/app.js`, in the function `expectedCost`.

## Tests

```bash
pytest
```

Eight tests. Every booking is in the fact table. The date table has no gaps.
Every key points at a real row. There is one night row for each occupied
room night. The room count is the busiest night. Occupancy is below 100
percent. RevPAR equals ADR times occupancy. And the headline numbers match.

## Data

Hotel booking demand, by Nuno Antonio, Ana de Almeida and Luis Nunes. Data in
Brief, 2019. CC BY 4.0. The build downloads it from the TidyTuesday mirror.
