-- one row per booking. arrival and status date both point at dim_date.
create or replace table fact_booking as
select
    b.booking_id,
    h.hotel_key,
    cast(strftime(b.arrival_date, '%Y%m%d') as integer) as arrival_date_key,
    cast(strftime(b.status_date, '%Y%m%d') as integer) as status_date_key,
    c.customer_key,
    ch.channel_key,
    b.arrival_date,
    b.is_cancelled,
    b.reservation_status,
    b.lead_time,
    case
        when b.lead_time <= 7 then '0-7'
        when b.lead_time <= 30 then '8-30'
        when b.lead_time <= 90 then '31-90'
        when b.lead_time <= 180 then '91-180'
        else '181+'
    end as lead_bucket,
    b.nights,
    b.adults,
    b.children,
    b.babies,
    b.deposit_type,
    b.meal,
    b.reserved_room_type,
    b.assigned_room_type,
    b.booking_changes,
    b.days_in_waiting_list,
    b.total_of_special_requests,
    b.adr,
    case when b.is_cancelled then 0 else b.adr * b.nights end as revenue
from stg_bookings b
join dim_hotel h on h.hotel_name = b.hotel
join dim_customer c
    on c.country = b.country
   and c.customer_type = b.customer_type
   and c.is_repeated_guest = b.is_repeated_guest
join dim_channel ch
    on ch.market_segment = b.market_segment
   and ch.distribution_channel = b.distribution_channel;
