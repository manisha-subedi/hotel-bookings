create or replace table dim_customer as
select
    row_number() over (order by country, customer_type, is_repeated_guest) as customer_key,
    country,
    customer_type,
    is_repeated_guest
from (select distinct country, customer_type, is_repeated_guest from stg_bookings);
