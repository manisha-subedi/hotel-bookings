-- occupancy, adr and revpar per hotel per month.
-- rooms available comes from dim_hotel.rooms, never from booked nights.
create or replace table kpi_hotel_month as
with sold as (
    select n.hotel_key, d.year_month, count(*) as rooms_sold, sum(n.adr) as revenue
    from fact_night n
    join dim_date d using (date_key)
    group by 1, 2
),
days as (
    select year_month, count(*) as days_in_month from dim_date group by 1
)
select
    s.hotel_key,
    h.hotel_name,
    s.year_month,
    h.rooms * dd.days_in_month as rooms_available,
    s.rooms_sold,
    s.revenue,
    s.rooms_sold / (h.rooms * dd.days_in_month) as occupancy,
    s.revenue / s.rooms_sold as adr,
    s.revenue / (h.rooms * dd.days_in_month) as revpar
from sold s
join dim_hotel h using (hotel_key)
join days dd using (year_month)
order by 1, 3;
