-- rooms is an estimate: the most rooms ever occupied on one night
create or replace table dim_hotel as
with occupied as (
    select hotel, arrival_date + cast(i as integer) as night
    from stg_bookings, unnest(range(0, nights)) as t(i)
    where not is_cancelled
),
peak as (
    select hotel, max(c) as rooms
    from (select hotel, night, count(*) as c from occupied group by 1, 2)
    group by 1
)
select
    row_number() over (order by hotel) as hotel_key,
    hotel as hotel_name,
    case hotel when 'City Hotel' then 'Lisbon' else 'Algarve' end as location,
    rooms
from peak;
