
-- count unique users who loaded the feed
select count(distinct user) from feed_usage where feed_usage.limit>=10 and (feed='skygraph' or feed='nebula_plus') and lastUpdated > DATE_SUB(NOW(), INTERVAL 7 day) order by refreshcount desc;

-- debug low post output users
select * from feed_usage where last_post_output is not null and feed_usage.limit>=10 and lastUpdated > DATE_SUB(NOW(), INTERVAL 1 hour) and last_post_output < feed_usage.limit / 2 order by last_post_output asc limit 20;

-- debug user nebulas
select sum(l.score), dc.e from likescore l join did_to_community dc on l.subject=dc.did where l.author = 'did:plc:abcd...' group by dc.e order by sum(l.score) desc;

-- debug user constellations
select sum(l.score), dc.o from likescore l join did_to_community dc on l.subject=dc.did where l.author = 'did:plc:abcd...' group by dc.o order by sum(l.score) desc;