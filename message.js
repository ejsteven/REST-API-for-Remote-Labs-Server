// ==========================================================================
// Filename:   message.js
// Copyright:  ©2011 Centre for Educational Innovation and Technology
// Developer:  Steven Chen
//
// Description:
// Module for different HTTP response message types
// ==========================================================================

/* Requiring standard dependencies */
var sys = require('sys');

/* List of Successful HTTP Responses*/

/* 200 Ok */
exports.okMsg = function(response, message, type, conn)
{
    noKeyStruct(response, 200, message, type, conn);
};

/* 200 Ok with Set-Cookie */
exports.okCookieMsg = function(response, key, message, type, conn)
{
    keyStruct(response, 200, key, message, type, conn);
};

/* 201 Created */
exports.createdMsg = function(response, message, type, conn)
{
    noKeyStruct(response, 201, message, type, conn);
};

/* List of Client Error HTTP Responses */

/* 400 Bad Request */
exports.badRequestMsg = function(response)
{
    noKeyStruct(response, 400, '400 Bad Request', 'text/plain', 'Close');
};

/* 403 Forbidden */
exports.forbiddenMsg = function(response)
{
    noKeyStruct(response, 403, '403 Forbidden', 'text/plain', 'Close');
};

/* 404 Not Found */
exports.notFoundMsg = function(response)
{
    noKeyStruct(response, 404, '404 Not Found', 'text/plain', 'Close');
};

/* Generic server response structure that does not set cookie */
noKeyStruct = function(response, status, message, type, conn)
{
    currDate = new Date();

    response.writeHead(status, {
	    'Date': currDate,
	    'Content-Length': message.length,
	    'Content-Type': type,
	    'Connection': conn
	});

    response.write(message);
    response.end();
};

/* Generic server response structure that requests creation of cookie */
keyStruct = function(response, status, key, message, type, conn)
{
    currDate = new Date();
    var expireDate = currDate.getDate() + 1;

    response.writeHead(status, {
	    'Date': currDate,
	    'Content-Length': message.length,
	    'Content-Type': type,
	    'Set-Cookie': 'SESS=' + key + '; expires=' + expireDate + '; path=/; domain=.localhost;',
	    'Connection': conn
	});

    response.write(message);
    response.end();
};