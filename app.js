const http = require('http');
const pzpr = require('./dist/pzpr.js');
const child_process = require('child_process');
const url = require('url');
const fs = require('fs');

const hostname = '127.0.0.1';
const port = 3456;

const template = fs.readFileSync('p.html', 'utf8');

function preview(req, res, pzl) {
	const canvas = {};
	const p = new pzpr.Puzzle(canvas);
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
}

function page(req, res, pzl) {
	var type_ = pzl.split('/')[0];
	res.statusCode = 200;
	res.setHeader('Content-Type', 'text/html');
	res.end(template
		.replace('%%OG_URL%%', 'http://puzz.link/p?' + pzl)
		.replace('%%OG_TITLE%%', type_ + ' puzzle')
		.replace('%%OG_IMAGE%%', 'http://puzz.link/pv?' + pzl));
}

const server = http.createServer((req, res) => {
	const u = url.parse(req.url);
	switch (u.pathname) {
	case '/pv':
		preview(req, res, u.query);
		break;
	case '/p':
		page(req, res, u.query);
		break;
	default:
		res.statusCode = 404;
		res.end();
		break;
	}
});

server.listen(port, hostname, () => {
	console.log(`Server running at http://${hostname}:${port}/`);
});

