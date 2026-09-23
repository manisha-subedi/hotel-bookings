# Building the Power BI report

This takes about a day. Do it in order. Save often.

## 1. Load the six tables

Home > Get data > Text/CSV. Load these six files from `powerbi/data/`, one
at a time. Click Load, not Transform, for each one.

- `dim_date.csv`
- `dim_hotel.csv`
- `dim_customer.csv`
- `dim_channel.csv`
- `fact_booking.csv`
- `fact_night.csv`

Check the types after loading. Click each table in the Data view. These
columns must be Date, not Text: `dim_date[date]`, `fact_booking[arrival_date]`,
`fact_booking[status_date]`. `is_cancelled` and `is_repeated_guest` must be
True/False. `adr` must be Decimal number. If something is wrong, Transform
data > click the column > change type > Close & Apply.

## 2. Draw the relationships

Go to Model view. Power BI may guess some of these. Delete its guesses and
draw these seven. Every one is Many to one, Single direction.

| From | To | Active |
|---|---|---|
| `fact_booking[hotel_key]` | `dim_hotel[hotel_key]` | yes |
| `fact_booking[customer_key]` | `dim_customer[customer_key]` | yes |
| `fact_booking[channel_key]` | `dim_channel[channel_key]` | yes |
| `fact_booking[arrival_date_key]` | `dim_date[date_key]` | yes |
| `fact_booking[status_date_key]` | `dim_date[date_key]` | **no** |
| `fact_night[hotel_key]` | `dim_hotel[hotel_key]` | yes |
| `fact_night[date_key]` | `dim_date[date_key]` | yes |

The second `fact_booking` to `dim_date` line must be inactive. Power BI draws
it as a dotted line. This is the cancel date. One measure switches it on
with `USERELATIONSHIP`.

Then mark the date table. Right click `dim_date` > Mark as date table >
choose the column `date`. The time measures need this.

## 3. Add the measures

Open `measures.dax`. In Report view, click `fact_booking` in the Data pane,
then Home > New measure. Paste one measure, press Enter. Repeat. The file
says which table each group goes on. About 40 measures, 20 minutes.

Put `[ADR]`, `[Occupancy]`, `[RevPAR]` and `[RevPAR check]` in four cards.
RevPAR and RevPAR check must show the same number. If not, a relationship is
wrong.

## 4. Set the date filter

The date table runs from October 2014 to September 2017. The bookings run
from July 2015 to August 2017. Add a report-level filter: Filters pane >
Filters on all pages > drag `dim_date[date]` > Advanced filtering > is on or
after 2015-07-01 and is on or before 2017-08-31. Without this, the occupancy
total divides by too many days.

## 5. Build the four pages

Keep it plain. White background, one font, no gradients. The two hotels
always use the same two colors: City Hotel blue `#2A78D6`, Resort Hotel
orange `#EB6834`. Put a slicer for `dim_hotel[hotel_name]` at the top of
every page.

**Page 1, Overview.** Six cards across the top: Bookings, Cancellation rate,
Occupancy, ADR, RevPAR, Revenue. Under them, a line chart of Occupancy by
`dim_date[year_month]`, one line per hotel. Then a line chart of ADR and
RevPAR by month. Then a small table: hotel, rooms, room nights, revenue.

**Page 2, Demand and channels.** A bar chart of Bookings by
`dim_channel[segment_group]`, with Cancelled bookings as a second series. A
bar chart of Cancellation rate by `fact_booking[lead_bucket]`. A bar chart of
Bookings by `dim_customer[country]`, top 10, cancelled ones excluded (filter
`is_cancelled` = False on this visual). A card with Share of bookings that
changes when you click a segment.

**Page 3, Customers.** Repeat guest share, Repeat guest cancellation rate,
and New guest cancellation rate as cards. A bar chart of Bookings by
`dim_customer[customer_type]`. Average nights and Guests per booking by
hotel. Special request share.

**Page 4, Cancellations.** A column chart of Cancellations by cancel date by
month. This is the measure that uses the inactive relationship. Next to it,
Cancelled bookings by arrival month, so you can see the two are different.
A bar chart of Cancellation rate by `fact_booking[deposit_type]`. Cards for
Late cancellation rate 7 days, one per hotel. A line chart of Revenue change
vs last year by month.

**Page 5, Booking detail.** A table with `booking_id`, `hotel_name`,
`arrival_date`, `nights`, `adr`, `deposit_type`, `segment_group`,
`reservation_status`. Make it a drill-through page: drag `dim_hotel[hotel_name]`
and `dim_date[year_month]` into the Drill through box in the Visualizations
pane. Then right click any bar on pages 1 to 4 > Drill through > Booking
detail.

## 6. Check the numbers against the web page

The page at https://manisha-subedi.github.io/hotel-bookings/ shows the same
numbers. With both hotels selected and the date filter set:

| Card | Should show |
|---|---|
| Bookings | 119,390 |
| Cancellation rate | 37.0% |
| Occupancy | about 77.6% |
| ADR | about €102 |
| RevPAR | about €79 |
| Revenue | about €26.0M |
| Cancellation rate 181 plus days | 57.0% |
| Late cancellation rate 7 days, City Hotel | 8.5% |
| Late cancellation rate 7 days, Resort Hotel | 4.8% |

If one is different, the most likely causes are the date filter in step 4,
or a relationship drawn the wrong way.

## 7. Save and hand over

Save as `powerbi/hotel-bookings.pbix`. Take one screenshot of each page,
full width, and save them as `powerbi/page-1-overview.png` and so on. Send
the .pbix and the screenshots. They go in the repo and on the web page.
