create or replace table dim_channel as
select
    row_number() over (order by market_segment, distribution_channel) as channel_key,
    market_segment,
    distribution_channel,
    case market_segment
        when 'Online TA' then 'Online travel agent'
        when 'Offline TA/TO' then 'Offline agent or operator'
        when 'Groups' then 'Groups'
        when 'Direct' then 'Direct'
        when 'Corporate' then 'Corporate'
        else 'Other'
    end as segment_group
from (select distinct market_segment, distribution_channel from stg_bookings);
