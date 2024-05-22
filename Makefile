.PHONY: all mysql

mysql:
	@docker-compose up -d
	@docker exec -it mysql mysql -uroot -pskygraph skygraph