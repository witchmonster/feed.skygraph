.PHONY: all mysql

mysql:
	@docker-compose up -d
	@mysql -h localhost -P 3306 --protocol=tcp -u root -p skygraph