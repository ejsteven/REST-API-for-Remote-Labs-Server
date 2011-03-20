// ==========================================================================
// Filename:   controls.js
// Copyright:  ©2011 Centre for Educational Innovation and Technology
// Developer:  Steven Chen
//
// Description:
// Module for providing a generic control functions
// for experiments
// ==========================================================================

/* Requiring standard dependencies */
var sys = require('sys');

/* Module for communicating with LabJack via TCP */
var comm = require('./tcp');

/* Module for interacting with SQLite database */
var store = require('./store-mysql');

/* Variable controlling the polling process */
var pollLJ;

exports.startExp = function(expno, callback)
{
    var selectElem = 'SELECT id, ipAddr, portNo ';
    var fromTable = 'FROM lj_list AS a, exp_list AS b, exp_done AS c ';
    var whereCond = 'WHERE c.expID = b.expID AND b.ljID = a.id AND c.expNo = ' + expno + ';';

    var sql = selectElem + fromTable + whereCond;

    store.sqlQuery(sql, function(ljInfo) {
        /* Obtain calibration constants from experiment LabJack */
        comm.getCalibrationBlock(ljInfo[0].ipAddr, parseInt(ljInfo[0].portNo), 0, function(block0) {
            sys.puts(sys.inspect(block0));
            comm.getCalibrationBlock(ljInfo[0].ipAddr, parseInt(ljInfo[0].portNo), 2, function(block2) {
                sys.puts(sys.inspect(block2));
                sql = 'UPDATE lj_list SET unipolarSlope0 = "' + block0.unipolarSlope0
                        + '", unipolarOffset0 = "' + block0.unipolarOffset0
                        + '", dacSlope0 = "' + block2.dacSlope0
                        + '", dacOffset0 = "' + block2.dacOffset0
                        + '", dacSlope1 = "' + block2.dacSlope1
                        + '", dacOffset1 = "' + block2.dacOffset1
                        + '" WHERE id = ' + ljInfo[0].id + ';';

                store.sqlQuery(sql, function(result) {
                    /* Acquire data from LabJack every two second */
                    pollLJ = setInterval(acquireData, 2000, expno);

                    /* Return the start time */
                    callback(Date.now().toString());
                });
            });
        });
    });
};

exports.stopExp = function(expno, callback)
{
    clearInterval(pollLJ);

    /* Reset experiment back to default here */
    this.setParam(expno, 0, 1.5, function() {
        /* Return the stop time */
        callback(Date.now().toString());
    });
};

exports.pauseExp = function(callback)
{
    clearInterval(pollLJ);

    /* Return the pause time */
    callback(Date.now().toString());
};

exports.resumeExp = function(expno, callback)
{
    pollLJ = setInterval(acquireData, 2000, expno);

    /* Return the resume time */
    callback(Date.now().toString());
};

exports.pollExp = function(expno, lastTimeAsked, callback)
{
    getDataSince(expno, lastTimeAsked, function(data) {
        if (data.length === 0) {
            data = {
                time: -1,
                value: -1
            };
        }
        callback(data);
    });
};

exports.singleExp = function(expno, path, lastTimeAsked, callback)
{
    getOutputSince(expno, path, lastTimeAsked, function(retOut) {
        if (retOut.length === 0)
            retOut = 'empty';

        callback(retOut);
    });
};

getOutputSince = function(expno, path, lastTimeAsked, callback)
{
    var dataType = '';

    if (path === 'in0') {
        dataType = 'ain0';
    } else if (path === 'in1') {
        dataType = 'ain1';
    } else if (path === 'in2') {
        dataType = 'ain2';
    } else if (path === 'in3') {
        dataType = 'ain3';
    }

    var selectElem = 'SELECT time, dataVal ';
    var fromTable = 'FROM exp_data ';
    var whereCond = 'WHERE expNo = ' + expno + ' AND time > ' + lastTimeAsked + ' AND dataType = "' + dataType + '";';

    var sql = selectElem + fromTable + whereCond;

    store.sqlQuery(sql, function (result) {
       callback(result);
    });    
};

getDataSince = function(expno, lastTimeAsked, callback)
{
    var selectElem = 'SELECT time, dataType, dataVal ';
    var fromTable = 'FROM exp_data ';
    var whereCond = 'WHERE expNo = ' + expno + ' AND time > ' + lastTimeAsked + ' AND dataType != "dac0";';

    var sql = selectElem + fromTable + whereCond;

    sys.puts(sql);

    store.sqlQuery(sql, function (result) {
        sys.puts("callback(getDataSince) " + sys.inspect(result));
        callback(result);
    });
};

exports.setParam = function(expno, dac, setvolt, callback)
{
    var selectElem = 'SELECT ipAddr, portNo, dacSlope0, dacOffset0, dacSlope1, dacOffset1 ';
    var fromTable = 'FROM lj_list AS a, exp_list AS b, exp_done AS c ';
    var whereCond = 'WHERE c.expID = b.expID AND b.ljID = a.id AND c.expNo = ' + expno + ';';

    var sql = selectElem + fromTable + whereCond;

    store.sqlQuery(sql, function(ljInfo) {
        var dacSlope;
        var dacOffset;

        if (dac === 0) {
            dacSlope = parseFloat(ljInfo[0].dacSlope0);
            dacOffset = parseFloat(ljInfo[0].dacOffset0);
        } else if (dac === 1) {
            dacSlope = parseFloat(ljInfo[0].dacSlope1);
            dacOffset = parseFloat(ljInfo[0].dacOffset1);
        }

        comm.setLabJack(ljInfo[0].ipAddr, parseInt(ljInfo[0].portNo), dacSlope, dacOffset, dac, setvolt, function(voltage) {
            var insertInto = 'INSERT INTO exp_data (time, expNo, dataType, dataVal) ';
            var valuesBind = 'VALUES (' + voltage.time + ', ' + expno + ', "dac' + dac + '", "' + voltage. value + '");';

            sql = insertInto + valuesBind;

            store.sqlQuery(sql, function(result) {
                callback(setvolt);
            });
        });
    });
};

acquireData = function(expno)
{
    var selectElem = 'SELECT ipAddr, portNo, unipolarSlope0, unipolarOffset0 ';
    var fromTable = 'FROM lj_list AS a, exp_list AS b, exp_done AS c ';
    var whereCond = 'WHERE c.expID = b.expID AND b.ljID = a.id AND c.expNo = ' + expno + ';';

    var sql = selectElem + fromTable + whereCond;

    store.sqlQuery(sql, function(ljInfo) {

        comm.allInputLabJack(ljInfo[0].ipAddr, parseInt(ljInfo[0].portNo), parseFloat(ljInfo[0].unipolarSlope0),
                parseFloat(ljInfo[0].unipolarOffset0), function(voltages) {

            sql = 'INSERT INTO exp_data (time, expNo, dataType, dataVal) '
                    + 'VALUES (' + voltages.time + ', ' + expno + ', "ain0", "' + voltages.ain0 + '");';

            store.sqlQuery(sql, function(result) {
                sql = 'INSERT INTO exp_data (time, expNo, dataType, dataVal) '
                        + 'VALUES (' + voltages.time + ', ' + expno + ', "ain1", "' + voltages.ain1 + '");';

                store.sqlQuery(sql, function(result) {
                    sql = 'INSERT INTO exp_data (time, expNo, dataType, dataVal) '
                            + 'VALUES (' + voltages.time + ', ' + expno + ', "ain2", "' + voltages.ain2 + '");';

                    store.sqlQuery(sql, function(result) {});
                });
            });

        });
    });
};

