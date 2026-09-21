-- one row per occupied room night. this is what occupancy is counted from.
create or replace table fact_night as
select
    f.booking_id,
    f.hotel_key,
    cast(strftime(f.arrival_date + cast(i as integer), '%Y%m%d') as integer) as date_key,
    f.adr
from fact_booking f, unnest(range(0, f.nights)) as t(i)
where not f.is_cancelled;
