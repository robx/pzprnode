const http = require('http');
const pzpr = require('./js/pzpr.js');
const child_process = require('child_process');
const url = require('url');
const fs = require('fs');
const querystring = require('querystring');

const hostname = '127.0.0.1';
const port = 3456;

function preview(req, res, query) {
	if (!query) {
		res.statusCode = 400;
		res.end();
		return;
	}
	const q = querystring.parse(query);
	var thumb = false;
	var pzv = '';
	for (var key in q) {
		if (key === 'thumb') {
			thumb = true;
		} else if (pzv === '' && q[key] === '') {
			pzv = key;
		}
	}
	if (!pzv) {
		res.statusCode = 400;
		res.end();
		return;
	}

	const canvas = {};
	const p = new pzpr.Puzzle(canvas);
	p.open(pzv, () => {
		const svg = p.toBuffer('svg', 0, 30);
		var args = ['convert', 'SVG:-', 'PNG:-'];
		if (thumb) {
			args = ['convert', 'SVG:-', '-resize', '200x200', 'PNG:-'];
		}
		const gm = child_process.spawn('gm', args);
		gm.on('error', (err) => {
			console.log('error starting gm:', err);
		});
		gm.on('close', (code) => {
			if (code !== 0) {
				console.log('gm exited with error');
			}
			res.statusCode = 400;
			res.end();
		});
		gm.stdout.on('data', (data) => {
			res.statusCode = 200;
			res.setHeader('Content-Type', 'image/png');
			res.write(data);
		});
		gm.stdin.end(svg);
	});
}

function processPost(req, res, callback) {
	var queryData = "";
	if(typeof callback !== 'function') { return null; }

	req.on('data', function(data) {
		queryData += data;
		if (queryData.length > 1024) {
			queryData = ""
			res.writeHead(413, {'Content-Type': 'text/plain'}).end();
			req.connection.detroy();
		}
	});

	req.on('end', function() {
		req.post = querystring.parse(queryData);
		callback();
	});
}

const rawpage = fs.readFileSync('p.html', 'utf8');
const parts = rawpage.split(/<title>[^<]*<\/title>/i);
const head = parts[0];
const body = parts[1];
const metatmpl = fs.readFileSync('meta.template', 'utf8');
const callbacktmpl = fs.readFileSync('callback.template', 'utf8');
const callbackanontmpl = fs.readFileSync('callback-anon.template', 'utf8');

function substitute(tmpl, vars) {
	for (var key in vars) {
		tmpl = tmpl.replace(new RegExp('%%' + key + '%%', 'g'), vars[key]);
	}
	return tmpl;
}

function sendPage(res, pzv, user_id, token) {
	if (!pzv) {
		res.end(rawpage);
	}
	const p = new pzpr.Puzzle();
	try {
		p.open(pzv, () => {
			var title = p.info.en;
			var size = "";
			if (!isNaN(p.board.cols) && !isNaN(p.board.rows)) {
				size = "" + p.board.rows + "×" + p.board.cols;
			}
			var desc = 'Solve a ' + p.info.en + ' puzzle';
			if (size) {
				title = size + ' ' + title;
				desc += ', size ' + size;
			}
			desc += '.';
			var vars = {
				'CANONICAL_URL': 'https://puzz.link/p?' + pzv,
				'TITLE': title,
				'DESCRIPTION': desc,
				'PREVIEW_IMG': 'https://puzz.link/pv?' + pzv,
				'PZV': pzv,
				'TOKEN': token,
				'USER_ID': user_id
			};
			res.statusCode = 200;
			res.setHeader('Content-Type', 'text/html');
			res.write(head);
			res.write(substitute(metatmpl, vars));
			if (user_id && token) {
				res.write(substitute(callbacktmpl, vars));
			} else {
				res.write(substitute(callbackanontmpl, vars));
			}
			res.end(body);
		});
	} catch(error) {
		console.log('caught error', error, 'sending raw page');
		res.end(rawpage);
	}
}

const server = http.createServer((req, res) => {
	// TODO: this try block doesn't seem to catch exceptions from the
	// post handler
	try {
		console.log('handling request:', req.url);
		const u = url.parse(req.url);
		switch (u.pathname) {
		case '/pv':
			preview(req, res, u.query);
			break;
		case '/p':
			if (req.method == 'POST') {
				processPost(req, res, function() {
					sendPage(res, u.query, req.post.user_id, req.post.token);
				});
			} else {
				sendPage(res, u.query, "", "");
			}
			break;
		default:
			console.log('404', u.pathname);
			res.statusCode = 404;
			res.end();
			break;
		}
	} catch (error) {
		console.log("caught error:", error);
		res.statusCode = 500;
		res.end();
	}
});

server.listen(port, hostname, () => {
	console.log(`Server running at http://${hostname}:${port}/`);
});

