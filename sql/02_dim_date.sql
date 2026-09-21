-- one row per day, no gaps, from the first status date to the last departure
create or replace table dim_date as
with bounds as (
    select least(min(arrival_date), min(status_date)) as lo,
           greatest(max(arrival_date + cast(nights as integer)), max(status_date)) as hi
    from stg_bookings
)
select
    cast(strftime(d, '%Y%m%d') as integer) as date_key,
    cast(d as date) as date,
    year(d) as year,
    month(d) as month,
    strftime(d, '%B') as month_name,
    strftime(d, '%Y-%m') as year_month,
    week(d) as week,
    day(d) as day,
    strftime(d, '%A') as day_name,
    dayofweek(d) in (0, 6) as is_weekend
from bounds, unnest(generate_series(lo, hi, interval 1 day)) as t(d);
