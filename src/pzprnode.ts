#!/usr/bin/env -S node -r esm

import * as http from 'http';
import * as child_process from 'child_process';
import * as url from 'url';
import * as fs from 'fs';
import * as stream from 'stream';

import pzpr from 'pzpr';

const templates = process.env.TEMPLATE_DIR || './templates';
const pzprdir = process.env.PZPR_DIR || './node_modules/pzpr/dist';
const imgdir = process.env.IMG_DIR || './img';

const hostname = process.env.HTTP_NAME || '127.0.0.1';
const port = Number(process.env.HTTP_PORT) || 3456;

function parse_query(query: string){
	const parts = query.split('&');
	var args = {
		thumb: false,
		frame: 0,
		svgout: false,
		pzv: '',
	};
	for (var part of parts) {
		if (part === 'thumb') {
			args.thumb = true;
		} else if (part === 'svg') {
			args.svgout = true;
		} else if (part.match(/^frame=([0-9]+)$/)) {
			args.frame = +RegExp.$1
		} else if (args.pzv === '' && part.match(/^[\w-]+\//)) {
			args.pzv = part;
		}
	}
	return args;
}

function pzvopen(pzv: string): Promise<any> {
	var p = new pzpr.Puzzle();
	return new Promise(function(resolve, reject){
		try {
			p.open(pzv, () => {
				resolve(p);
			});
		} catch(err) {
			reject(err);
		}
	});
}

interface PuzzleDetails {
	pid: string;
	title: string;
	cols: number;
	rows: number;
}

function pzvdetails(pzv: string): PuzzleDetails {
	const urldata = pzpr.parser.parseURL(pzv);
	const info = pzpr.variety(urldata.pid);
	return {
		pid: urldata.pid,
		title: info.en,
		cols: urldata.cols,
		rows: urldata.rows
	}
}

function preview(req: http.IncomingMessage, res: http.ServerResponse, query: string) {
	if (!query) {
		res.statusCode = 400;
		res.end();
		return;
	}
	var qargs = parse_query(query);
	if (!qargs.pzv) {
		res.statusCode = 400;
		res.end();
		console.log('no pzv found:', query);
		return;
	}
	// deal with <type>_edit links
        var pzv = qargs.pzv.replace(/_edit/, '');

	var details = pzvdetails(pzv);
	if (details.cols > 100 || details.rows > 100) {
		res.statusCode = 400;
		res.end("oversized puzzle");
		console.log('skipping large puzzle:', pzv);
		return;
	}

	const canvas = {};
	const p = new pzpr.Puzzle(canvas);
	p.open(pzv, () => {
		const cols = details.cols;
		const rows = details.rows;
		enum Shape {
			Square,
			Tall,
			Wide,
		}
		var shape = Shape.Square;
		if (!isNaN(cols) && !isNaN(rows)) {
			if (rows/cols >= 2) {
				shape = Shape.Tall;
			} else if (cols/rows >= 2) {
				shape = Shape.Wide;
			}
		}

		p.setMode('play');
		p.setConfig('undefcell', false);
		p.setConfig('autocmp', false);
		const svg = p.toBuffer('svg', 0, 30);

		if (qargs.svgout) {
			res.statusCode = 200;
			res.setHeader('Content-Type', 'image/svg+xml');
			res.end(svg);
			return;
		}

		res.statusCode = 200;
		res.setHeader('Content-Type', 'image/png');

		var args = ['convert', 'PNG:-', '-trim'];
		const maskbaseargs = ['composite', '-compose', 'CopyOpacity'];
		var maskargs: string[] = [];
		if (qargs.thumb) {
			if (shape === Shape.Square) {
				args.push('-resize', '200x200');
			} else {
				args.push('-resize');
				maskargs = ['composite', '-compose', 'CopyOpacity'];
				if (shape === Shape.Wide) {
					args.push('x120');
					maskargs.push(imgdir + '/mask-horiz.png');
				} else if (shape === Shape.Tall) {
					args.push('120x');
					maskargs.push(imgdir + '/mask-vert.png');
				}
				args.push('-crop', '200x200');
				maskargs.push('PNG:-', 'PNG:-');
			}
		}
		if (qargs.frame > 0){
			var border = '' + qargs.frame + '%';
			args.push('-bordercolor', 'none', '-border', border);
		}
		args.push('PNG:-');

		var gmout: stream.Writable = res;
		if (maskargs.length > 0) {
			const gmcompose = child_process.spawn('gm', maskargs);
			gmout = gmcompose.stdin;
			gmcompose.on('error', (err) => {
				console.log('error starting gm:', err);
			});
			gmcompose.on('close', (code) => {
				if (code !== 0) {
					console.log('gm exited with error');
				}
				res.end();
			});
			gmcompose.stderr.on('data', (data) => {
				console.log(data.toString());
			});
			gmcompose.stdout.on('data', (data) => {
				res.write(data);
			});
		}

		const gm = child_process.spawn('gm', args);
		gm.on('error', (err) => {
			console.log('error starting gm:', err);
		});
		gm.on('close', (code) => {
			if (code !== 0) {
				console.log('gm exited with error');
			}
			gmout.end();
		});
		gm.stderr.on('data', (data) => {
			console.log(data.toString());
		});
		gm.stdout.on('data', (data) => {
			gmout.write(data);
		});

		const rsvg = child_process.spawn('rsvg-convert');
		rsvg.on('error', (err) => {
			console.log('error starting rsvg-convert:', err);
		});
		rsvg.on('close', (code) => {
			if (code !== 0) {
				console.log('rsvg-convert exited with error');
			}
			gm.stdin.end();
		});
		rsvg.stderr.on('data', (data) => {
			console.log(data.toString());
		});
		rsvg.stdout.on('data', (data) => {
			gm.stdin.write(data);
		});
		rsvg.stdin.end(svg);
	});
}

const rawpage = fs.readFileSync(pzprdir + '/p.html', 'utf8');
const parts = rawpage.split(/<title>[^<]*<\/title>/i);
const head = parts[0];
const body = parts[1];
const metatmpl = fs.readFileSync(templates + '/meta.template', 'utf8');
const callbacktmpl = fs.readFileSync(templates + '/callback.template', 'utf8');

function substitute(tmpl: string, vars: Record<string, string>): string {
	for (var key in vars) {
		tmpl = tmpl.replace(new RegExp('%%' + key + '%%', 'g'), vars[key]);
	}
	return tmpl;
}

function sendPage(res: http.ServerResponse, query: string) {
	var qargs = parse_query(query);
	if (!qargs.pzv) {
		res.statusCode = 200;
		res.setHeader('Content-Type', 'text/html');
		res.write(head);
		res.write(substitute(callbacktmpl, {}));
		res.end(body);
		return;
	}
	try {
		const p = pzvdetails(qargs.pzv);
		var size = "";
		if (!isNaN(p.cols) && !isNaN(p.rows)) {
			size = "" + p.rows + "×" + p.cols;
		}
		var title = p.title;
		var desc = 'Solve a ' + p.title + ' puzzle';
		if (size) {
			title = size + ' ' + title;
			desc += ', size ' + size;
		}
		desc += '.';
		var vars: Record<string, string> = {
			'CANONICAL_URL': 'https://puzz.link/p?' + qargs.pzv,
			'TITLE': title,
			'DESCRIPTION': desc,
			'PREVIEW_IMG': 'https://puzz.link/pv?frame=5&' + qargs.pzv,
			'PZV': qargs.pzv
		};
		res.statusCode = 200;
		res.setHeader('Content-Type', 'text/html');
		res.write(head);
		res.write(substitute(metatmpl, vars));
		res.write(substitute(callbacktmpl, vars));
		res.end(body);
	} catch(err) {
		console.log('caught error', err, 'sending raw page');
		res.statusCode = 200;
		res.setHeader('Content-Type', 'text/html');
		res.end(rawpage);
	}
}

const server = http.createServer((req, res) => {
	try {
		console.log('handling request:', req.url);
		const u = url.parse(req.url!);
		switch (u.pathname) {
		case '/pv':
			preview(req, res, u.query || "");
			break;
		case '/p':
			sendPage(res, u.query || "");
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
