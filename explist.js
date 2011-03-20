// ==========================================================================
// Filename:   explist.js
// Copyright:  ©2011 Centre for Educational Innovation and Technology
// Developer:  Steven Chen
//
// Description:
// Module containing handlers for dealing with list of experiments
// that is supported by Rest Labs and assignable to each user
// ==========================================================================

/* Requring standard dependencies */
var http = require('http');
var sys  = require('sys');

/* Module for interacting with SQLite database */
var store = require('./store-mysql');

/* Module for sending HTTP responses */
var res = require('./message');

/* Return list of all experiments */
exports.getAllExp = function(request, response) {
    var selectElem = 'SELECT * ';
    var fromTable = 'from exp_list ';

    var sql = selectElem + fromTable;

    store.sqlQuery(sql, function(result) {
        res.okMsg(response, JSON.stringify(result), 'application/json', 'close');
    });
};

/* Return list of experiments */
exports.getExpList = function(request, response) {
    var user = request.url.split('/')[3];

    var selectElem = 'SELECT * ';
    var fromTable = 'from exp_list, user_list ';
    var whereCond = 'WHERE exp_list.expID = user_list.expID AND user_list.expUser = "' + user + '";';

    var sql = selectElem + fromTable + whereCond;
    
    store.sqlQuery(sql, function(result) {
        res.okMsg(response, JSON.stringify(result), 'application/json', 'close');
    });    
};

/* Handler for getting list of experiments */ 
exports.expListHandler = function(request, response) {
    if (request.method === 'POST') {
		this.postExpList(request, response);
    } else if (request.method === 'PUT') {
		this.putExpList(request, response);
    } else if ((request.method === 'GET') && (request.url.split('/').length === 3)) {
		this.getAllExp(request, response);
    } else if ((request.method === 'GET') && (request.url.split('/').length === 4)) {
		this.getExpList(request, response);
    } else if (request.method === 'DELETE') {
		this.deleteExpList(request, response);
	} else res.badRequestMsg(response);
};

/*
exports.deleteExpList = function(request, response) {
	var deleteFrom = 'DELETE FROM user_list ';
	var whereCond = 'WHERE expUser = "' + user + '";';
	
	
		
};
*/

/* Adding list of experiments user is allowed to use */
exports.postExpList = function(request, response) {
    var ref = this;

    ref.getReqBody(request, response, function(postMess) {
	    var parseMess = JSON.parse(postMess);

	    ref.expListEdit(request, response, parseMess);
	});
};

/* Editing list of experiments user is allowed to use */
exports.putExpList = function(request, response) {
    var user = request.url.split('/')[3];
    var ref = this;
    var parseMess;

    ref.getReqBody(request, response, function(putMess) {
            parseMess = JSON.parse(putMess);

	    var deleteFrom = 'DELETE FROM user_list ';
	    var whereCond = 'WHERE expUser = "' + user + '";';

	    var sql = deleteFrom + whereCond;

	    store.sqlQuery(sql, function(result) {
		    ref.expListEdit(request, response, parseMess);
		});
	});
};

exports.expListEdit = function(request, response, mess) {
    var user = request.url.split('/')[3];
    var i, sql;

    sql = "";

    for (i = 0; i < mess[0].expList.length; i++) {
		var insertInto = 'INSERT INTO user_list ';
		var valuesBind = 'VALUES (' + mess[0].expList[i] + ', "' + user + '");';

		sql = sql + insertInto + valuesBind;
    }

    sys.puts(sql);

    store.sqlQueryScript(sql, function() {
            res.okMsg(response, JSON.stringify([{explistresult: 'success'}]), 'application/json', 'close');
	});
};

exports.getReqBody = function(request, response, callback)
{
    var messBody = '';

    request.addListener('data',function(mess) {
	    messBody += mess;
	});

    request.addListener('end', function() {
	    callback(messBody);
	});
};
