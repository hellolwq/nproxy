var HTTP = require('http');
var FS = require('fs');
var URL = require('url');
var HtmlParser = require('./lib/htmlparser.js');
var CODE  = require('./lib/iconv-lite.js');

var SVR_PORT = 8080;
var LOG_DIR = "./logs/";
var ACCESS_LOG_FILE = LOG_DIR + "access.log";
var ERROR_LOG_FILE = LOG_DIR + "error.log";
var DBG_LOG_FILE = LOG_DIR +  "debug.log";
var PORTAL_FILE = "index.html";
var ERROR_RESPONSE = "<h1>error!!</h1>";
var LOG_DBG = 0;
var LOG_INFO = 1;
var LOG_ACCESS = 2;
var LOG_ERROR = 3;


var g_dbgFile = null;
var g_portal_content = null;
function main()
{
	init_nproxy();
    var webSvr = HTTP.createServer(function (client_request, client_response){
        if(!proxy_pre_handle(client_request, client_response))
            proxy_handle(client_request, client_response);
        
    });
    webSvr.listen(SVR_PORT);
    
    console.log('Server running at ' + SVR_PORT);
    
    webSvr.on('close',function(){
        if(g_dbgFile)
        {
            FS.close(g_dbgFile);
            g_dbgFile = null;
        }
    });
}

function proxy_pre_handle(request, response)
{
    if(request === null && typeof(request) != 'object')
    {
        return false;
    }
    
    var inUrl = request.url;
    if(/^\/nproxy\//i.test(inUrl))//nproxy url
        return false;
        
    proxy_response_client(response,g_portal_content);
    proxy_response_flush(response);
    return true;
}

function proxy_handle(request, response)
{
    var origUrl = proxy_resolve_request(request);
    if(origUrl)
    {
        log(LOG_INFO,"origUrl:" + origUrl.protocol+"//" + origUrl.host+":" + origUrl.port+ origUrl.path);
        origUrl.headers = proxy_copy_header(request);
        htmlContent = proxy_request(origUrl,function(server_response,body){
            var header = server_response.headers;
            if(header['content-type'] == 'image/jpeg'
                || header['content-type'] == 'image/gif'
            )
            {
                proxy_response_client(response,body, header)
            }
            else
            {
                if(body)
                {
                    if(server_response.proxy_buffer == null)
                    {
                        server_response.proxy_buffer = [];
                        server_response.proxy_buffer_size = 0;
                    }
                    
                    server_response.proxy_buffer.push(body);
                    server_response.proxy_buffer_size += body.length;
                }
                else
                {
                    var sendBuf = proxy_rewrite(request,server_response);
                    proxy_response_client(response, sendBuf , header);
                    proxy_response_flush(response);
                }
                
            }
            
            //log(LOG_DBG,"response.proxy_buffer:" +response.proxy_buffer); 
        });
    }
    else
    {   
       proxy_response_client(response,ERROR_RESPONSE);
       proxy_response_flush(response);
    }
}

function proxy_get_response_encoding(http_obj)
{
    if(typeof(http_obj.proxy_encoding) == 'string')
        return http_obj.proxy_encoding;
    
    var retEncoding = "utf8";
    var encodeType = http_obj.headers["content-type"];
    //log(LOG_DBG,"encodeType=" + encodeType);
    if(/charset=/i.test(encodeType))
    {
        retEncoding = encodeType.replace(/^[^=]+charset=/,'');
        if(retEncoding == 'gb2312')
            retEncoding = 'gbk';
    }
    
    return (http_obj.proxy_encoding = retEncoding);
}


function proxy_decode_stream(response)
{
    var buffer = new Buffer(response.proxy_buffer_size), pos = 0;
    var buffers = response.proxy_buffer;
    var encoding = proxy_get_response_encoding(response);
    for(var i = 0, len = buffers.length; i < len; i++) {
        buffers[i].copy(buffer, pos);
        pos += buffers[i].length;
    }
    return CODE.decode(buffer,encoding);
}
                    
function proxy_copy_header(request)
{
    var retHeader = {};
    if(!request || !request.headers)
        return retHeader;
    
    var ignoreItems = ['host','accept-encoding'].join(',')
    for( var key in request.headers)
    {
        if(ignoreItems.indexOf(key.toLowerCase()) !=  -1)
            continue;
        
        retHeader[key] = request.headers[key];
    }
    
    return retHeader;
}

function init_nproxy()
{
    g_portal_content = FS.readFileSync(PORTAL_FILE);
    if(!g_portal_content)
    {
        g_portal_content = ERROR_RESPONSE;
    }
    
    //log(LOG_INFO,"g_portal_content=" + g_portal_content);
	try
	{
		var statRet = FS.statSync(LOG_DIR);
		if(!statRet || !statRet.isDirectory())
		{
			FS.mkdirSync(LOG_DIR);
		}
	}catch(e){
		FS.mkdirSync(LOG_DIR);
	}
	
	g_dbgFile = FS.openSync(DBG_LOG_FILE,"a+");
}
function helper_getRefUrl(reqst)
{
    return reqst.url.replace(/http\/.*$/i,'');
}

/*
    proxy url:http://proxy/nproxy/http/host:port/path
*/
function proxy_resolve_request(request)
{
    if(request === null && typeof(request) != 'object')
    {
        return null;
    }
    //http://localhost:8080/nproxy/http/test/abc.com1
    var proxyUrlReg = /(https?:\/\/[^\/]+)?\/nproxy\/(https?)\/([^:\/]+)(:\d+)?(\/.*)?$/i;
    request.url = request.url.toLowerCase();
    //log(LOG_DBG,"request.url = " + request.url);
    var ret = null;
    if(ret = request.url.match(proxyUrlReg))
    {
		request.orig_url = ret[2] +"://"+ ret[3] + (ret[4]?ret[4]:'') + (ret[5]?ret[5]:'');
        request.proxy_host = ret[1];
		if(ret[4] == null)
        {
            if(ret[2] == 'http')
                ret[4] = 80;
            else if(ret[2] == 'https')
                ret[4] = 443; 
        }
		else
		{
			ret[4] = ret[4].substr(1);//esacep ':'
		}
		
		ret[5] = ret[5]?ret[5]:'';
        return {
            protocol:ret[2]+":",
            host:ret[3],
            port:ret[4],
            path:ret[5]?ret[5]:''
        };
    }
    return null;
}

function proxy_request(urlObj,callback)
{
	//log(LOG_DBG,"proxy_request " + urlObj);
    HTTP.get(urlObj, function(res) {
      res.on('data',function(body){
			//log(LOG_DBG,"response length:" + body);
            callback(res,body);
      });
	  
	   res.on('end',function(body){
			callback(res,null);
      });
    }).on('error', function(e) {
       //log(LOG_ERROR,e.getMessage());
       print_r(e);
    });
}

function proxy_rewrite(client_request,server_response)
{
    var encoding = proxy_get_response_encoding(server_response);
    var data = proxy_decode_stream(server_response);
    //log(LOG_DBG,"typeof(data):",typeof(data));
    log(LOG_DBG,"***************************proxy_rewrite before:" + data);
    var ret = data;
    //try{
        ret = HtmlParser.RewriteHtml(data,client_request,helper_trans_url);
    //}catch(e){
        //ret = data;
    //}
    log(LOG_DBG,"***************************proxy_rewrite after:" + ret);
    return CODE.encode(ret,"GBK")
}

function helper_trans_url(url,request)
{
    log(LOG_DBG,"helper_trans_url,url=" + url + ",refUrl:" + request.orig_url);
    //nproxy/http/200.200.72.50
	var fullPath = URL.resolve(request.orig_url,url);
	var ret = (request.proxy_host?request.proxy_host:'') + "/nproxy/" + fullPath.replace(/^(https?):\/\//i,"$1/");
    log(LOG_DBG,"helper_trans_url url:" + url + ",ret=" + ret);
    return ret;
}

function proxy_response_flush(response)
{
	proxy_response_client(response,null);
}

function proxy_response_client(response,data,header)
{
    var contentType = 'text/html';
    if(header)
        contentType = header['content-type'];
    
    //log(LOG_DBG,"proxy_response_client,contentType=" + contentType);
    if(!response.is_headset)
    {
		response.writeHead(200, {'content-type':contentType });
		response.is_headset = true;
	}
	
	if(data)
		response.write(data);
	else
		response.end();
}


function log(level,info)
{
    info += "\n";
    if(level < LOG_ACCESS)
    {
        console.log(info);
		if(g_dbgFile)
			FS.writeSync(g_dbgFile, info, null);
    }
    else if(g_dbgFile)
    {
        FS.writeSync(g_dbgFile, info, null);
    }
}
function print_r(obj)
{
    if(typeof(obj) != 'object') 
        return;
        
    for(propName in obj)
    {
        if(!isNaN(propName))
            continue;
        log(LOG_DBG,"propName:" + propName+ "\n");
        //log(LOG_DBG,"obj['"+ propName +"']" + obj[propName] + "\n");
    }
}

main();