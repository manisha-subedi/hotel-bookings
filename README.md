# Two hotels, 119,390 bookings

Live page: https://manisha-subedi.github.io/hotel-bookings/

A resort hotel in the Algarve and a city hotel in Lisbon. Three years of real
bookings, July 2015 to August 2017. The page has three parts:

1. The numbers a manager looks at every month: occupancy, ADR, RevPAR,
   bookings by segment, cancellations by lead time and deposit.
2. A lookup. Pick lead time, deposit, channel, and new or repeat guest. See
   how often bookings like that cancelled, and how many bookings the rate
   rests on.
3. An overbooking tool. Given the late-cancellation rate and two costs, it
   shows how many rooms to sell above the room count, and why.

```
bookings: 119390
cancelled: 37.0%
cancelled, lead 181+: 57.0%
City Hotel: 8.5% of bookings still on the books 7 days before arrival cancelled
Resort Hotel: 4.8% of bookings still on the books 7 days before arrival cancelled
City Hotel: 226 rooms (estimated from the busiest night)
Resort Hotel: 187 rooms (estimated from the busiest night)
```

## How to run

```bash
uv venv && uv pip install -e ".[dev]"
python build.py
pytest
python -m http.server --directory site
```

`build.py` downloads the CSV, builds the tables in `hotel.duckdb`, and writes
four small JSON files to `site/data/`. The page reads those files. There is no
server and no model.

## The data model

The source is one flat table with 32 columns. `sql/` reshapes it into a star
schema, one file per table, run in order:

| Table | Rows | What it is |
|---|---|---|
| `dim_date` | 1,064 | every day from the first status date to the last departure, no gaps |
| `dim_hotel` | 2 | hotel, location, and the room count |
| `dim_customer` | 448 | country, customer type, new or repeat |
| `dim_channel` | 26 | market segment and distribution channel |
| `fact_booking` | 119,390 | one row per booking, with arrival date key and status date key |
| `fact_night` | 255,040 | one row per occupied room night |
| `kpi_hotel_month` | 54 | occupancy, ADR, RevPAR per hotel per month, the partial last month is left off the page |

The arrival date and the cancellation date both point at `dim_date`. That is
the role-playing date in the CV.

## The room count

The data has no room count. `dim_hotel.rooms` is the most rooms ever occupied
on one night: 226 for the city hotel, 187 for the resort. Occupancy is rooms
sold over rooms available, where rooms available is that count times the days
in the month.

A common mistake is to divide by booked nights instead. That gives 100 percent
every month. `tests/test_model.py` fails if occupancy ever reaches 100
percent, and checks that RevPAR equals ADR times occupancy.

## The late-cancellation rate

37 percent of bookings cancel, but most of them cancel weeks before arrival,
when the room can be sold again. For overbooking, the rate that matters is how
many bookings still on the books N days before arrival still cancel or do not
show up. The build computes it for 1, 3, 7, 14 and 30 days. The overbooking
tool uses it as the default.

## The overbooking tool

For each number of extra bookings, the tool treats cancellations as
independent with the rate you set, works out the chance of each number of
guests showing up, and adds up the expected cost of empty rooms and of guests
sent away. The lowest expected cost is the answer. It is about 20 lines in
`site/app.js`, function `expectedCost`.

## Tests

```bash
pytest
```

Eight tests: every booking is in the fact table, the date table has no gaps,
every key resolves, one night row per occupied room night, rooms equals the
busiest night, occupancy is below 100 percent, RevPAR equals ADR times
occupancy, and the headline numbers.

## Data

Hotel booking demand, Nuno Antonio, Ana de Almeida and Luis Nunes, Data in
Brief, 2019. CC BY 4.0. The build downloads it from the TidyTuesday mirror.
