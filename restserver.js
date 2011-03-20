// ==========================================================================
// Filename:   restserver.js
// Copyright:  ©2011 Centre for Educational Innovation and Technology
// Developer:  Steven Chen
//
// Description:
// Main Javascript for creating HTTP-REST server for Remote Labs
// ==========================================================================

/* Requring standard dependencies */
var http = require('http');
var sys  = require('sys');
var repl = require('repl');
var querystring = require ('querystring');
var url = require('url');
var path = require('path');
var fs = require('fs');

/* Module for sending HTTP responses */
var res = require('./message');

/* Module for communicating with LabJack via TCP */
var comm = require('./tcp');

/* Module for interacting with SQLite database */
var store = require('./store-mysql');

/* Module for acting on user profiles */
var user = require('./profile');

/* Module for acting on experiment lists */
var explist = require('./explist');

/* Requiring experiment modules */
var controls = require('./controls');

/* Array for storing active and expired sessions */
sessionKey = [];
userName = [];
accessLevel = []; // For future use - giving extra features for admin
expiryDate = []; // For future use - variable cookie expiry date

/* Array for storing user currently in control of experiment */
expList = [];
expUserSess = [];
expNo = [];

/* Generating a random string that is 'strlength' long - will be used to generate session keys */
randomString = function(strlength) {
    var chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXTZabcdefghiklmnopqrstuvwxyz';
    var rndStrg = '';
    for (var i = 0; i < strlength; i++) {
        var rnum = Math.floor(Math.random() * chars.length);
        rndStrg += chars.substring(rnum,rnum+1);
    }
    return rndStrg;
};

/* Obtain the session key from the user */
getSessionKey = function(details, response) {
    var user = details.split('?')[0];
    var pass = details.split('?')[1];
    var sessKey;

    passWordCheck(user, pass, function(found) {
        if (found) {
            var listTop = sessionKey.length;

            sessKey = randomString(16);
            sessionKey[listTop] = sessKey;
            userName[listTop] = user;

            /* Store the level of access beside session key record for later reference */
            var sql = 'SELECT type FROM profile WHERE user = "' + user + '";';

            store.sqlQuery(sql, function(result) {
                accessLevel[listTop] = result[0].type;
            });

            res.okCookieMsg(response, sessKey, sessKey, 'text/plain', 'close');
        } else
            res.okMsg(response, "error", 'text/plain', 'close');
    });
};

/* Check if username exists and if password exists */
/* Return 1 if password is correct */
/* Return 0 if username cannot be found or password is incorrect */
passWordCheck = function(user, pass, callback) {
    var obtainPass;
    var retVal = 0;

    var sql = 'SELECT pass FROM profile WHERE user = "' + user + '";';

    store.sqlQuery(sql, function (result) {

        if (result.length !== 0) {
            obtainPass = result[0].pass;

            if (obtainPass === pass) retVal = 1;
        }
        callback(retVal);
    });
};

/* Find session in 'sessionKey' array */
/* Return 'found' position if session key exists */
/* Return -1 if session key cannot be found */
sessionSearch = function(key) {
    var found = -1;
    var i;

    for (i = 0; i < sessionKey.length; i++) {
        if (key === sessionKey[i]) {
            found = i;
        }
    }

    return found;
};

/* Check if user a session (key) is authorised to use a particular experiment (exp) */
expAuthCheck = function(exp, key) {
    var allowed = 0;

    for (var i = 0; i < expUserSess.length; i++) {
        if (expUserSess[i] === key) {
            if (expList[i].expID == exp) {
                allowed = 1;
            }
        }
    }

    return allowed;
};

/* Search experiment position in 'expList' array where experiment ID is 'expid' */
expSearch = function(expid) {
    var retPos = -1;
    var i;

    for (i = 0; i < expList.length; i++) {
        if (expList[i].expID == expid) {
            retPos = i;
        }
    }

    return retPos;
};

/* Function responsible for directing to appropriate server action based on URL */
routeToAction = function(request, response) {
    var route = request.url.split('/')[2];
    var details = request.url.split('/')[3];

    sys.puts('Route: ' + route);

    if (request.url.split('/')[1] === 'static') {
        var uri = url.parse(request.url).pathname;
        var filename = path.join(process.cwd(), uri);
        path.exists(filename, function(exists) {
            if (!exists) {
                response.writeHead(404, {"Content-Type": "text/plain"});
                response.write("404 Not Found");
                response.end();
                return;
            }

            fs.readFile(filename, "binary", function(err, file) {
                if(err) {
                    response.writeHead(500, {"Content-Type": "text/plain"});
                    response.write(err);
                    response.end();
                    return;
                }

                response.writeHead(200);
                response.write(file, "binary");
                response.end();
            });
        });

        /* User must visit the login page to obtain a session key (cookie) */
    } else if (route === "login") {
        getSessionKey(details, response);

        /* Check if session key is valid before user is allowed to access resources below */
    } else if ((route === "userinfo") || (route === "explist") || (route === "reserve") || (route === "queue") ||
            (route === "data") || (route === "userlist") || (route === "checklist")) {

        if (sessionSearch(request.headers.cookie.split(';')[0].split('=')[1]) !== -1) {

            /* Get, update, add or delete user information */
            if (route === "userinfo") {
                user.userInfoHandler(request, response);

                /* Get list of experiments allowed by user */
            } else if (route === "explist") {
                explist.expListHandler(request, response);

                /* Attempt to reserve an experiment */
            } else if (route === "reserve") {
                getReserve(request, response);

                /* Get current position in queue */
            } else if (route === "queue") {
                /* Due to simplified system there is no queue */

                /* Get and change experiment resources */
            } else if (route === "data") {
                dataHandler(request, response);

            } else if (route === "userlist") {
                getUserList(request, response);

            } else if (route === "checklist") {
                getCheckList(request, response);

            }
        } else {
            res.forbiddenMsg(response);
        }
    } else if ((route === "param") || (route === "start") || (route === "stop")  || (route === "pause") ||
            (route === "resume") || (route === "poll") || (route === "ui") ||
            (route === "api") || (route === 'single')) {

        var sessKey = request.headers.cookie.split(';')[0].split('=')[1];
        var selectExpID = request.url.split('/')[3];
        var currExpNo = expNo[expSearch(selectExpID)];
        var currUser = userName[sessionSearch(sessKey)];

        if (route === "ui") {
            /* Return list of UI for a particular experiment or selected JSON schema */
            uiHandler(request, response);
        } else if (route === "api") {
            if (request.method === 'GET')
                getAPIDesc(request, response);
            else if (request.method === 'POST') {
                sys.puts("IM HERE");
                postAPIDesc(request, response);
            } else
                res.badRequestMsg(response);
        } else

        /* Futher check if user is permitted to control experiment */
        if ((sessionSearch(sessKey) === -1)
                || (expAuthCheck(selectExpID, sessKey) === 0)) {
            res.forbiddenMsg(response);
        } else {
            if (route === "start") {
                var insertInto = 'INSERT INTO exp_done (expNo, expID, expUser) ';
                var valuesBind = 'VALUES (' + currExpNo + ', ' + selectExpID + ', "' + currUser + '");';

                var sql = insertInto + valuesBind;

                store.sqlQuery(sql, function(result) {
                    controls.startExp(currExpNo, function(startTime) {
                        sql = 'UPDATE exp_done SET startTime = "'
                                + startTime + '" WHERE expNo = ' + currExpNo +';';

                        store.sqlQuery(sql, function(result) {
                            res.okMsg(response, startTime, 'application/json', 'close');
                        });
                    });
                });
            } else if (route === "poll") {
                var lastQuery = request.url.split('/')[4];

                controls.pollExp(currExpNo, lastQuery, function(data) {
                    res.okMsg(response, JSON.stringify(data), 'application/json', 'close');
                });
            } else if (route === 'single') {
                var path = request.url.split('/')[4];
                var lastQuery = request.url.split('/')[5];

                sys.puts('path = ' + path);
                sys.puts('lastQuery = ' + lastQuery);

                controls.singleExp(currExpNo, path, lastQuery, function(data) {
                    res.okMsg(response, JSON.stringify(data), 'application/json', 'close');
                });
            } else if (route === "stop") {
                controls.stopExp(currExpNo, function(stopTime) {
                    var sql = 'UPDATE exp_done SET stopTime = "'
                            + stopTime + '" WHERE expNo = ' + currExpNo + ';';

                    store.sqlQuery(sql, function(result) {
                        /* Relinquish access rights from experiment */
                        expNo[expSearch(selectExpID)] = undefined;
                        expUserSess[expSearch(selectExpID)] = undefined;

                        res.okMsg(response, stopTime, 'text/plain', 'close');
                    });
                });
            } else if (route === "pause") {
                controls.pauseExp(function(pauseTime) {
                    res.okMsg(response, pauseTime, 'text/plain', 'close');
                });
            } else if (route === "resume") {
                controls.resumeExp(currExpNo, function(resumeTime) {
                    res.okMsg(response, resumeTime, 'text/plain', 'close');
                });
            } else if (route === "param") {
                /* Set experiment parameter */
                user.getReqBody(request, response, function(putMess) {
                    outVal = JSON.parse(putMess);
                    controls.setParam(currExpNo, 0, outVal.out0, function(setvolt) {
                        res.okMsg(response, JSON.stringify(setvolt), 'application/json', 'close');
                    });
                });
            }
        }
    } else if (route === "logout") {
        /* Removing session key information */
        closeSession(request, response);
    } else {
        /* Return not found response if no matching URL */
        res.notFoundMsg(response);
    }
};

getAPIDesc = function(request, response) {
    var expID = request.url.split('/')[3];

    var selectElem = 'SELECT expAPI ';
    var fromTable = 'FROM exp_list AS a, exp_api_desc AS b ';
    var whereCond = 'WHERE a.expName = b.name AND a.expID = ' + expID;

    var sql = selectElem + fromTable + whereCond;

    store.sqlQuery(sql, function(result) {
        res.okMsg(response, JSON.stringify(result), 'application/json', 'close');
    });
};

postAPIDesc = function(request, response) {
    var expID = request.url.split('/')[3];
    var i = 0;

    var selectElem = 'SELECT max(schemaID) AS maxID ';
    var fromTable = 'FROM schema_list;';

    var sql = selectElem + fromTable;

    explist.getReqBody(request, response, function(postMess) {
        parseMess = JSON.parse(postMess);
        store.sqlQuery(sql, function(maxID) {
            var nextID = maxID[0].maxID + 1;

            var insertInto = 'INSERT INTO schema_list ';
            var valuesBind = 'VALUES (' + nextID + ', "' + parseMess[0] + '");';

            sql = insertInto + valuesBind;
            sys.puts(sql);

            store.sqlQuery(sql, function() {
                insertInto = 'INSERT INTO exp_schema ';
                valuesBind = 'VALUES (' + expID + ', ' + nextID + ');';

                sql = insertInto + valuesBind;
                sys.puts(sql);

                store.sqlQuery(sql, function() {
                    sql = "";
                    for (i = 1; i < parseMess.length; i ++) {
                        insertInto = 'INSERT INTO ui_schema (schemaID, widJSON) ';
                        valuesBind = 'VALUES (' + nextID + ', ' + JSON.stringify(parseMess[i]) + ');';

                        sql = sql + insertInto + valuesBind;
                        sys.puts(sql);
                    }

                    store.sqlQueryScript(sql, function() {
                        res.okMsg(response, "RAR", 'text/plain', 'close');
                    });
                });
            });
        });
    });
};

uiHandler = function(request, response) {
    if (request.url.split('/').length === 4) {
        getSchemaList(request, response);
    } else if (request.url.split('/').length === 5) {
        getSchema(request, response);
    } else
        res.badRequestMsg(response);
};

getSchemaList = function(request, response) {
    var expID = request.url.split('/')[3];

    var selectElem = 'SELECT a.schemaID, schemaName ';
    var fromTable = 'FROM schema_list AS a, exp_schema AS b ';
    var whereCond = 'WHERE a.schemaID = b.schemaID AND b.expID = ' + expID + ';';

    var sql = selectElem + fromTable + whereCond;

    store.sqlQuery(sql, function(result) {
        res.okMsg(response, JSON.stringify(result), 'application/json', 'close');
    });
};

getSchema = function(request, response) {
    var expID = request.url.split('/')[3];
    var schemaID = request.url.split('/')[4];

    var selectElem = 'SELECT widJSON ';
    var fromTable = 'FROM exp_schema AS a, ui_schema AS b ';
    var whereCond = 'WHERE a.schemaID = b.schemaID AND a.expID = ' + expID + ' AND b.schemaID = ' + schemaID + ';';

    var sql = selectElem + fromTable + whereCond;

    store.sqlQuery(sql, function(result) {
        res.okMsg(response, JSON.stringify(result), 'application/json', 'close');
    });
};

closeSession = function (request, response) {
    var sessPos = sessionSearch(request.headers.cookie.split(';')[0].split('=')[1]);

    if (sessPos !== -1) {
        sessionKey[sessPos] = undefined;
        userName[sessPos] = undefined;
        accessLevel[sessPos] = undefined;
        expiryDate[sessPos] = undefined;
        res.okMsg(response, "Logged out", "text/plain", 'close');
    } else res.badRequestMsg(response);
};


dataHandler = function(request, response) {
    if (request.url.split('/').length === 4) {
        getPrevExpList(request, response);
    } else if (request.url.split('/').length === 5) {
        getExpData(request, response);
    } else res.badRequestMsg(response);
};

getPrevExpList = function(request, response) {
    var user = request.url.split('/')[3];

    var selectElem = 'SELECT expNo, expName, startTime, stopTime ';
    var fromTable = 'FROM exp_done AS a, exp_list AS b, profile AS c ';
    var whereCond = 'WHERE a.expID = b.expID AND a.expUser = c.user AND c.user = "' + user + '";';

    var sql = selectElem + fromTable + whereCond;

    store.sqlQuery(sql, function(result) {
        res.okMsg(response, JSON.stringify(result), 'application/json', 'close');
    });
};

getUserList = function(request, response) {
    var sql = 'SELECT user FROM profile;';

    store.sqlQuery(sql, function(result) {
        res.okMsg(response, JSON.stringify(result), 'application/json', 'close');
    });
};

getExpData = function(request, response) {
    var expNo = request.url.split('/')[4];
    var sql = 'SELECT time, dataType, dataVal FROM exp_data WHERE expNo = ' + expNo + ';';

    store.sqlQuery(sql, function(result) {
        res.okMsg(response, JSON.stringify(result), 'application/json', 'close');
    });
};

getCheckList = function(request, response) {
    var user = request.url.split('/')[3];

    var selectElem = 'SELECT exp_list.expID  AS expID, expName, ';
    var ifState = 'IF (EXISTS(select * FROM user_list WHERE exp_list.expID = user_list.expID AND expUser = "' + user + '"), true, false) AS isDone ';
    var fromTable = 'FROM exp_list;';

    var sql = selectElem + ifState + fromTable;

    store.sqlQuery(sql, function(expListDone) {
        res.okMsg(response, JSON.stringify(expListDone), 'application/json', 'close');
    });
};

getReserve = function(request, response) {
    var expPos = expSearch(request.url.split('/')[4]);

    if (expPos !== -1) {
        if (expUserSess[expPos] === undefined) {
            expUserSess[expPos] = request.headers.cookie.split(';')[0].split('=')[1];

            var sql = 'SELECT max(expNo) AS max from exp_done';

            store.sqlQuery(sql, function(result) {
                expNo[expPos] = (result[0].max + 1);
                res.okMsg(response, "Reserved", 'text/plain', 'close');
            });
        } else {
            res.okMsg(response, "Experiment Used", 'text/plain', 'close');
        }
    } else {
        res.okMsg(response, "Invalid Experiment ID", 'text/plain', 'close');
    }
};

expSearch = function(exp) {
    var found = -1;
    var i;

    for (i = 0; i < expList.length; i++) {
        if (expList[i].expID == exp) {
            found = i;
        }
    }

    return found;
};

/* Loads list of experiment from database into program memory */
loadExpList = function() {
    var sql = 'SELECT * FROM exp_list;';

    store.sqlQuery(sql, function(result) {
        expList = result;
    });
};

/* Server startup procedure */
loadExpList();

/* Configure HTTP server listen to port 8000 for requests */
http.createServer(function (request, response) {
    routeToAction(request, response);
}).listen(8000);

sys.puts('Server running at http://126.0.0.1:8000/');
