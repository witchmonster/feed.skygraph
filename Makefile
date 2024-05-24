.PHONY: all mysql

mysql:
	@docker-compose up -d mysql
	@docker exec -it mysql mysql -uroot -pskygraph skygraph