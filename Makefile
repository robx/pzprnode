.PHONY: build

TSC:=./node_modules/.bin/tsc

build:
	$(TSC)
	cp ./built/pzprnode.js pzprnode
	chmod +x pzprnode
