
-- count unique users who loaded the feed
select count(distinct user) from feed_usage where feed_usage.limit>=10 and (feed='skygraph' or feed='nebula_plus') and lastUpdated > DATE_SUB(NOW(), INTERVAL 7 day) order by refreshcount desc;

-- debug low post output users
select * from feed_usage where last_post_output is not null and feed_usage.limit>=10 and lastUpdated > DATE_SUB(NOW(), INTERVAL 1 hour) and last_post_output < feed_usage.limit / 2 order by last_post_output asc limit 20;

-- debug user nebulas
select sum(l.score), dc.e from likescore l join did_to_community dc on l.subject=dc.did where l.author = 'did:plc:abcd...'  and dc.e <> 'e[user`s nebula]' group by dc.e order by sum(l.score) desc limit 10;

-- debug user constellations
select sum(l.score), dc.o from likescore l join did_to_community dc on l.subject=dc.did where l.author = 'did:plc:abcd...' and dc.o <> 'o[user`s constellation]' group by dc.o order by sum(l.score) desc limit 20;

-- infer community if there's none using harmonic weight
select a.subject, a.score, b.score, a.to_e, 2 * a.score * b.score / (a.score + b.score) as harmonicWeight from (select l.subject, to_e, sum(l.score) score from likescore l where l.author = 'did:plc:ragtjsm2j2vknwkz3zp4oxrd' and to_e is not null and to_e <> '' group by to_e) as a join (select from_e, sum(l.score) score from likescore l where l.subject = 'did:plc:ragtjsm2j2vknwkz3zp4oxrd' and from_e is not null and from_e <> '' group by from_e) as b on a.to_e=b.from_e order by harmonicWeight desc limit 1;