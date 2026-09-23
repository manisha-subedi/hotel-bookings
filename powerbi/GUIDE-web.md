# Building the report in Power BI in the browser

Use this guide if you are at app.powerbi.com in a browser, not Power BI
Desktop. The browser cannot load six csv files into one model, so it uses one
Excel file that has all six tables inside.

## 1. Upload the Excel file

Open https://app.powerbi.com and go to My workspace.
Click Upload > Browse. Pick `hotel-bookings-tables.xlsx`.
If it asks Import or Upload, choose Import. Import makes a semantic model
with the six tables. Upload only stores the file.

Wait until the semantic model `hotel-bookings-tables` shows in the
workspace. Open it. You should see six tables on the right: dim_date,
dim_hotel, dim_customer, dim_channel, fact_booking, fact_night.

## 2. Open the data model and draw the relationships

In the semantic model page, click Open data model at the top. If you do not
see it, click Settings for the semantic model and turn on data model
editing, then come back.

Drag a column from one table onto a column of another to make a
relationship. Or use Manage relationships > New. Make these seven. Each one
is Many to one, cross filter direction Single.

| From | To | Active |
|---|---|---|
| fact_booking[hotel_key] | dim_hotel[hotel_key] | yes |
| fact_booking[customer_key] | dim_customer[customer_key] | yes |
| fact_booking[channel_key] | dim_channel[channel_key] | yes |
| fact_booking[arrival_date_key] | dim_date[date_key] | yes |
| fact_booking[status_date_key] | dim_date[date_key] | **no** |
| fact_night[hotel_key] | dim_hotel[hotel_key] | yes |
| fact_night[date_key] | dim_date[date_key] | yes |

For the inactive one: after you make it, click the line, open its
properties, and untick Make this relationship active. It becomes a dotted
line.

If you can see Mark as date table for dim_date, use it with the column
`date`. If you cannot find it, skip it. The time measures are written to
work either way.

## 3. Add the measures

Still in the data model view. Click a table in the Data pane, then New
measure. Paste one line from `measures.dax`, press Enter. The section
headers in the file say which table each group goes on. 43 measures.

The two label measures at the end are several lines long. Paste them whole.

## 4. Make the report

Go back to the workspace, click the semantic model, then Create report >
Start from scratch. This opens the report editor in the browser. It works
like Desktop.

Add a report-level filter first: Filters > Filters on all pages >
dim_date[date] > Advanced filtering > on or after 2015-07-01 and on or
before 2017-08-31.

Add two Card visuals, RevPAR and RevPAR check. Same number means the model
is right. If not, a relationship is wrong.

Then build the five pages from `GUIDE.md`, section 5. The visuals and fields
are the same.

## 5. Check the numbers

`GUIDE.md`, section 6. Bookings 119,390. Cancellation rate 37.0 percent.
Late cancellation rate 7 days: City 8.5 percent, Resort 4.8 percent.

## 6. Save and share

File > Save. Name it `hotel-bookings`.

Screenshots: one per page, full width, both hotels selected. Name them
page-1-overview.png to page-5-booking-detail.png.

Share link: Share > Copy link. This works for people in the same
organisation only.

Public link: File > Embed report > Publish to web (public). If the option is
missing or greyed out, the admin has turned it off. Then the screenshots and
the share link are the deliverable.

Download: File > Download this file. Save as `hotel-bookings.pbix`. If the
option is greyed out, the browser will not export a model built this way.
That is fine. The screenshots are enough for the portfolio.
