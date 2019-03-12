.PHONY: build

build:
	mkdir -p js
	cp -R node_modules/pzpr/dist/* js
	cp node_modules/pzpr-puzzlink/dist/p.html .

