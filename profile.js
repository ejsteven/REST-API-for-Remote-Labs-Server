// ==========================================================================
// Filename:   profile.js
// Copyright:  ©2011 Centre for Educational Innovation and Technology
// Developer:  Steven Chen
//
// Description:
// Module containing handlers for dealing with user profile
// ==========================================================================

/* Requring standard dependencies */
var http = require('http');
var sys  = require('sys');

/* Module for interacting with SQLite database */
var store = require('./store-mysql');

/* Module for sending HTTP responses */
var res = require('./message');

/* Return profile of user */
exports.getProfile = function(request, response, callback) {
    var user = request.url.split('/')[3];
    var sql = 'SELECT first, last, uni, course FROM profile WHERE user = "' + user + '";';

    store.sqlQuery(sql, function (result) {
	    res.okMsg(response, JSON.stringify(result), 'application/json', 'close');
	});
};

/* Allow user to edit profile */
exports.editProfile = function (request, response) {
    var user = request.url.split('/')[3];

    /* Obtain and parse put message body */
    this.getReqBody(request, response, function(putMess) {
	    var parseMess = JSON.parse(putMess);
	    
	    /* Update profile in database where username is 'user' */
	    var updateTable = 'UPDATE profile ';
	    var setElements = 'SET first = "' + parseMess[0].first + '", last = "' + parseMess[0].last
		+ '", uni = "' + parseMess[0].uni + '", course = "' + parseMess[0].course + '" ';
	    var whereCond = 'WHERE user = "' + user + '";';
	    
	    var sql = updateTable + setElements + whereCond;
	    
	    store.sqlQuery(sql, function (result) {
		    /* Grab user profile where username is 'user' and return back to client as confirmation */
		    var sql = 'SELECT first, last, uni, course FROM profile WHERE user = "' + user + '"';
		    
		    store.sqlQuery(sql, function(profile) {
			    res.okMsg(response, JSON.stringify(profile), 'application/json', 'close');
			});
		});
	});
};

/* Allow admin to add profile */
exports.addProfile = function (request, response) {
    var user = request.url.split('/')[3];

    /* Obtain and parse put message body */
    this.getReqBody(request, response, function(postMess) {
	    var parseMess = JSON.parse(postMess);

	    var selectElem = 'SELECT user ';
	    var fromTable = 'FROM profile ';
	    var whereCond = 'WHERE user = "' + user + '";';

	    var sql = selectElem + fromTable + whereCond;
	    
	    store.sqlQuery(sql, function (found) {
		    if (found.length === 0) {
			/* Add new profile  where username is 'user' */
			var insertInto = 'INSERT INTO profile ';
			var valuesBind = 'VALUES ("' + user + '", "' + parseMess[0].pass + '", "'
			    + parseMess[0].first + '", "' + parseMess[0].last + '", "' + parseMess[0].uni + '", "'
			    + parseMess[0].course + '", "' + parseMess[0].type + '");';
			
			sql = insertInto + valuesBind;
			
			store.sqlQuery(sql, function(result) {
				res.okMsg(response, JSON.stringify([{accountresult: 'success'}]), 'application/json', 'close');
			    });
		    } else res.okMsg(response, JSON.stringify([{accountresult: 'fail'}]), 'application/json', 'close');
		});			
	});
};

/* Allow admin to delete profile */
exports.deleteProfile = function (request, response) {
    var user = request.url.split('/')[3];

    /* Query to delete profile with username = user */
    var deleteFrom = 'DELETE FROM profile ';
    var whereCond = 'WHERE user = "' + user + '";';

    var sql = deleteFrom + whereCond;

    store.sqlQuery(sql, function (result) {
		deleteFrom = 'DELETE FROM user_list ';
		whereCond = 'WHERE expUser = "' + user + '";';
    sql=deleteFrom + whereCond;
    sys.puts("Testing if been deleted  "+sql );
		
		store.sqlQuery(sql, function (result) {		
			res.okMsg(response, 'Deleted', 'text/plain', 'close');
		});
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

/* Check to see if user would like to get, create, edit and delete a profile */
exports.userInfoHandler = function(request, response)
{
    var user = request.url.split('/')[3];
    
    if (request.method === 'GET') {
	this.getProfile(request, response);
    } else if (request.method === 'PUT') {
	this.editProfile(request, response);
    } else if (request.method === 'POST') {
	this.addProfile(request, response);
    } else if (request.method === 'DELETE') {
	this.deleteProfile(request, response);
    } else res.badRequestMsg(response);
};
