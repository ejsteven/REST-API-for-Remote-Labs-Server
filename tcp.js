// ==========================================================================
// Filename:   tcp.js
// Copyright:  ©2011 Centre for Educational Innovation and Technology
// Developer:  Steven Chen
//
// Description:
// Module for communicating with LabJack via TCP Command/Response and is
// based on C_Native_TCP_UE9 (driver provided by LabJack Corp.)
// ==========================================================================

/* Requring standard dependencies */
var sys = require("sys");

/* TCP dependencies */
var net = require("net");

normalChecksum8 = function (b, n)
{
    var a, i, bb;    

    for (i = 1, a = 0; i < n; i++) {
	a += b[i];
    }

    bb = Math.floor(a / 256);
    a = (a - 256 * bb) + bb;
    bb  = Math.floor(a / 256);

    return ((a - 256 * bb) + bb);
};

extendedChecksum16 = function(b, n)
{
    var a, i;

    for (i = 6, a = 0; i < n; i++)
	a += b[i];

    return a;
};

extendedChecksum8 = function(b)
{
    var i, a, bb;

    a = 0;
    for (i = 1; i < 6; i++)
	a = a + b[i];
    
    bb = Math.floor(a / 256);
    a = (a - 256 * bb) + bb;
    bb  = Math.floor(a / 256);

    return ((a - 256 * bb) + bb);
};

extendedChecksum = function(b, n)
{

    var a;

    a = extendedChecksum16(b, n);

    b[4] = a & 0xff;
    b[5] = (Math.floor(a / 256)) & 0xff;
    b[0] = extendedChecksum8(b);
};

FPIntArrayToFPDouble = function(buffer, startindex)
{
    var resultDec = 0;
    var resultWh = 0;
    var i;

    for (i = 0; i < 4; i++) {
	resultDec = resultDec + buffer[startindex + i] * Math.pow(2, (i * 8));
	resultWh = resultWh + buffer[startindex + i + 4] * Math.pow(2, (i * 8));

	/* Supposed to be a 32 bit integer so enforce limits */
	if (resultWh > 2147483647) {
	    resultWh = resultWh - 2147483648;
	    resultWh = -2147483648 + resultWh;
	}
    }
  
    return (resultWh + (resultDec / 4294967296.0));
};

/* Read calibration block from LabJack memory */
exports.getCalibrationBlock = function (host, port, block, callback)
{
    var conn = net.createConnection(port, host);
    var calBuff = [];

    calBuff[1] = 0xF8; // Command byte
    calBuff[2] = 0x01; // Number of data words
    calBuff[3] = 0x2A; // Extended command number
    calBuff[6] = 0x00;
    calBuff[7] = block; // Block number
    extendedChecksum(calBuff, 8);

    messBuff = new Buffer(calBuff);

    conn.addListener('connect', function SendCalCommand() {
	    conn.removeListener('connect', SendCalCommand);
	    conn.write(messBuff);	    
	});

    conn.addListener('data', function ReadCalMessage(data) {
	    conn.removeListener('data', ReadCalMessage);
	    conn.end;

	    var calBlock;

	    if (block === 0) {
		var calBlock = {
		    unipolarSlope0: FPIntArrayToFPDouble(data, 8),
		    unipolarOffset0: FPIntArrayToFPDouble(data, 16),
		    unipolarSlope1: FPIntArrayToFPDouble(data, 24),
		    unipolarOffset1: FPIntArrayToFPDouble(data, 32),
		    unipolarSlope2: FPIntArrayToFPDouble(data, 40),
		    unipolarOffset2: FPIntArrayToFPDouble(data, 48),
		    unipolarSlope3: FPIntArrayToFPDouble(data, 56),
		    unipolarOffset3: FPIntArrayToFPDouble(data, 64)
		};
	    } else if (block === 2) {
		var calBlock = {
		    dacSlope0: FPIntArrayToFPDouble(data, 8),
		    dacOffset0: FPIntArrayToFPDouble(data, 16),
		    dacSlope1: FPIntArrayToFPDouble(data, 24),
		    dacOffset1: FPIntArrayToFPDouble(data, 32)
		};
	    }
	    
	    callback(calBlock);
	});
};

exports.setLabJack = function(host, port, slope, offset, dac, setvolt, callback)
{
    var conn = net.createConnection(port, host);
    var setBuff = [];
    var setData = [];

    var bytesVoltage = slope * setvolt + offset;

    if(bytesVoltage < 0)
	bytesVoltage = 0;
    if(bytesVoltage > 4095)
	bytesVoltage = 4095;

    setBuff[1] = 0xA3;  //command byte
    setBuff[2] = 0x05;  //IOType = 5 (analog)
    setBuff[3] = dac;  //Channel = 0 (DAC0)
    setBuff[4] = Math.floor(bytesVoltage & (0x00FF));  //low bits of voltage
    setBuff[5] = Math.floor(bytesVoltage / 256) + 192;    //high bits of voltage
    //(bit 7 : Enable, bit 6: Update)
    setBuff[6] = 0x00;  //Settling time - does not apply to analog output
    setBuff[7] = 0x00;  //reserved
    setBuff[0] = normalChecksum8(setBuff, 8);

    var buff = new Buffer(setBuff);

    conn.addListener('connect', function SendSetCommand() {
	    conn.removeListener('connect', SendSetCommand);
	    conn.write(buff, encoding="ascii");	    
	});

    conn.addListener('data', function ReadSetMessage(data) {
	    conn.removeListener('data', ReadSetMessage);
	    conn.end();
		
	    var dataTime = Date.now();

	    setData = ({
		    time: dataTime,
		    value: setvolt
		});				

	    callback(setData);
	});
};

exports.readLabJack = function (host, port, slope, offset, ain, callback)
{
    var conn = net.createConnection(port, host);
    var sendBuff = [];
    var retData;

    sendBuff[1] = 0xA3; // Command byte
    sendBuff[2] = 0x04; // IOType = 4 (Single IO)
    sendBuff[3] = ain; // Channel
    sendBuff[4] = 0x00; // BipGain (Bip = unipolar, Gain = 1)
    sendBuff[5] = 17; // Resolution
    sendBuff[6] = 0x00; // Settling time = 0
    sendBuff[7] = 0x00; // Reserved
    sendBuff[0] = normalChecksum8(dataBuff, 8);

    var buff = new Buffer(sendBuff);

    conn.addListener('connect', function SendRetCommand() {
	    conn.removeListener('connect', SendRetCommand);
	    conn.write(buff, encoding="ascii");	    
	});

    conn.addListener('data', function ReadRetMessage(data) {
	    conn.removeListener('data', ReadRetMessage);
	    conn.end();
		
	    var dataTime = Date.now();
	    var termRead = slope * (data[5] + (data[6] * 256)) + offset;

	    retData = ({
		    time: dataTime,
		    value: termRead
		});				

	    callback(retData);
	});
};

exports.allInputLabJack = function (host, port, slope, offset, callback) {
    var conn = net.createConnection(port, host);
    var sendBuff = [];
    var retAllData;
    var i;
    
    sendBuff[1] = 0xF8; // Command byte
    sendBuff[2] = 0x0E; // Number of data words
    sendBuff[3] = 0x00; // Extended command number

    /* All these bytes are set to zero since we are not changing
       the FIO, EIO, CIO and MIO directions and states */
    for(i = 6; i <= 15; i++)
	sendBuff[i] = 0x00;

    /* Do not want to set DAC0 - setLabJack function is responsible */
    sendBuff[16] = 0x00;
    sendBuff[17] = 0x00;
    //sendBuff[16] = Math.floor((840.060976 * 1.5 - 19.652685) & (0x00FF));  //low bits of voltage
    //sendBuff[17] = Math.floor((840.060976 * 1.5 - 19.652685) / 256) + 192;    //high bits of voltage

    /* Do not want to set DAC1 - setLabJack function is responsible */
    sendBuff[18] = 0x00;
    sendBuff[19] = 0x00;
    //sendBuff[18] = Math.floor((839.540887 * 1.5 + 13.396908) & (0x00FF));  //low bits of voltage
    //sendBuff[19] = Math.floor((839.540887 * 1.5 + 13.396908) / 256) + 192;    //high bits of voltage
    
    sendBuff[20] = 0x0F; // AINMask - reading AIN0 - AIN3, not AIN4 - AIN7
    sendBuff[21] = 0x00; // AINMask - not reading AIN8 - AIN15
    sendBuff[22] = 0x00; // AIN14ChannelNumber - not using
    sendBuff[23] = 0x00; // AIN15ChannelNumber - not using
    sendBuff[24] = 17; // Resolution
    
    /* Setting BipGains */
    for(i = 25; i < 34; i++)
	sendBuff[i] = 0x00 // Bip = unipolar, Gain = 1
    
	    extendedChecksum(sendBuff, 34);
    
    var buff = new Buffer(sendBuff);
    
    conn.addListener('connect', function SendRetCommand() {
	    conn.removeListener('connect', SendRetCommand);
	    conn.write(buff, encoding="ascii");	    
	});
    
    conn.addListener('data', function ReadRetMessage(data) {
	    conn.removeListener('data', ReadRetMessage);
	    conn.end();

	    sys.puts(data[12]);

	    retAllData = ({
		    time: Date.now(),
		    ain0: slope * (data[12] + (data[13] * 256)) + offset,
		    ain1: slope * (data[14] + (data[15] * 256)) + offset,
		    ain2: slope * (data[16] + (data[17] * 256)) + offset,
		    ain3: slope * (data[18] + (data[19] * 256)) + offset
		});				

	    callback(retAllData);
	});
};

// var hello = this;

// this.getCalibrationBlock('130.102.70.47', 52360, 0, function(calblock) {
// 	sys.puts(sys.inspect(calblock));
// 	hello.allInputLabJack('130.102.70.47', 52360, calblock.unipolarSlope0, calblock.unipolarOffset0, function(ret) {
// 		sys.puts(sys.inspect(ret));
// 	    });
//     });
