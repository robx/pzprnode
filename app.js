const http = require('http');
const pzpr = require('./dist/pzpr.js');
const child_process = require('child_process');
const url = require('url');

const hostname = '127.0.0.1';
const port = 3456;

const server = http.createServer((req, res) => {
	const canvas = {};
	const p = new pzpr.Puzzle(canvas);
	const pzl = url.parse(req.url).query;
	if (!pzl) {
		res.statusCode = 400;
		res.end();
		return;
	}
	p.open(pzl, () => {
		const svg = p.toBuffer();
		res.statusCode = 200;
		res.setHeader('Content-Type', 'image/png');

		const gm = child_process.spawn('gm', ['convert', 'SVG:-', 'PNG:-']);
		gm.on('error', (err) => {
			console.log('error starting gm:', err);
		});
		gm.on('close', (code) => {
			if (code !== 0) {
				console.log('gm exited with error');
			}
			res.end();
		});
		gm.stdout.on('data', (data) => {
			res.write(data);
		});
		gm.stdin.end(svg);
	});
});

server.listen(port, hostname, () => {
	console.log(`Server running at http://${hostname}:${port}/`);
});

