
-- count unique users who loaded the feed
select count(distinct user) from feed_usage where feed_usage.limit=30 and (feed='skygraph' or feed='nebula_plus') and lastUpdated > DATE_SUB(NOW(), INTERVAL 2 day) order by refreshcount desc;

-- view low post output users
select * from feed_usage where last_post_output is not null and feed_usage.limit=30 order by last_post_output asc limit 20;