// ==========================================================================
// Filename:   store-mysql.js
// Copyright:  ©2011 Centre for Educational Innovation and Technology
// Developer:  Steven Chen
//
// Description:
// Module which uses "node-mysql-libmysqlclient" to interface
// with mySQL database
// ==========================================================================

/* Use node-sqlite module */
var sys = require('sys');
var mysql = require('./node-mysql-libmysqlclient/mysql-libmysqlclient'),
    conn,
    result,
    row,
    rows;

/* Set database connection settings */
var host = "localhost";
var user = "root";
var password = "root";
var database = "rest";

conn = mysql.createConnectionSync();
conn.connectSync(host, user, password, database);

exports.sqlQuery = function(query, callback)
{
    conn.query(query, function (err, res) {
	    if (err) throw err;

	    if (res !== undefined) {
		res.fetchAll(function (err, rows) {
			if (err) throw err;
		    
			res.freeSync();

			callback(rows);
		    });
	    } else callback([]);
	});
};

exports.sqlQueryScript = function(queryscript, callback)
{
    var querysplit = queryscript.split(';');

    sys.puts(querysplit[0]);
    sys.puts(querysplit[1]);

    this.sqlQueryIterate(querysplit, function() {
	    callback();
	});
};

exports.sqlQueryIterate = function(querysplit, callback)
{
    var ref = this;

    ref.sqlQuery((querysplit[0] + ';'), function(result) {
	    if (querysplit.length > 2) {
		querysplit.shift();
		ref.sqlQueryIterate(querysplit, function() {
			callback();
		    });
	    } else
		callback();
	});
};
