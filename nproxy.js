var HTTP = require('http');
var FS = require('fs');
var URL = require('url');
var HtmlParser = require('./lib/htmlparser.js');

var SVR_PORT = 8080;
var LOG_DIR = "./logs/";
var ACCESS_LOG_FILE = LOG_DIR + "access.log";
var ERROR_LOG_FILE = LOG_DIR + "error.log";
var DBG_LOG_FILE = LOG_DIR +  "debug.log";

var LOG_DBG = 0;
var LOG_INFO = 1;
var LOG_ACCESS = 2;
var LOG_ERROR = 3;


var g_dbgFile = null;
function main()
{
	init_logs();
    var webSvr = HTTP.createServer(function (request, response){
        //log(LOG_INFO, "A request in!");
        var origUrl = proxy_resolve_request(request);
        if(origUrl)
        {
            log(LOG_INFO,"origUrl:" + origUrl.protocol+"//" + origUrl.host+":" + origUrl.port+ origUrl.path);
            htmlContent = proxy_request(origUrl,function(header,body){
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
						if(response.proxy_buffer == null)
							response.proxy_buffer = body.toString();
						else
							response.proxy_buffer += body.toString();
					}
					else
					{
						var sendBuf = proxy_rewrite(response.proxy_buffer,request);
						proxy_response_client(response, sendBuf , header);
					}
					
				}
				
				//log(LOG_DBG,"response.proxy_buffer:" +response.proxy_buffer); 
				
				
               
            });
        }
        else
        {   
            var htmlContent = "<h1>error!!</h1>";
            proxy_response_client(response,htmlContent);
        }
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

function init_logs()
{
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
			//log(LOG_DBG,"proxy_request:" + body);
            callback(res.headers,body);
      });
	  
	   res.on('end',function(body){
			callback(res.headers,null);
      });
    }).on('error', function(e) {
       //log(LOG_ERROR,e.getMessage());
       print_r(e);
    });
}

function proxy_rewrite(data,request)
{
    //log(LOG_DBG,"typeof(data):",typeof(data));
    log(LOG_DBG,"proxy_rewrite before:" + data);
    var ret = data;
   // try{
        ret = HtmlParser.RewriteHtml(data,request,helper_trans_url);
    //}catch(e){
    //    ret = data;
    //}
    log(LOG_DBG,"proxy_rewrite after:" + ret);
    return ret;
    /*return data.replace(/(\s(src|href)=['"])([^'"]*)(['"])/g, function() { 
        return (arguments[1]+helper_trans_url(arguments[3],request)+arguments[4]);
    });*/
}

function helper_trans_url(url,request)
{
    //log(LOG_DBG,"helper_trans_url,url=" + url + ",refUrl:" + request.orig_url);
    //nproxy/http/200.200.72.50
	var fullPath = URL.resolve(request.orig_url,url);
	var ret = (request.proxy_host?request.proxy_host:'') + "/nproxy/" + fullPath.replace(/^(https?):\/\//i,"$1/");
    //log(LOG_DBG,"helper_trans_url url:" + url + ",ret=" + ret);
    return ret;
}

function proxy_response_client(response,data,header)
{
    var contentType = 'text/html';
    if(header)
        contentType = header['content-type'];
    
    //log(LOG_DBG,"proxy_response_client,contentType=" + contentType);
    if(response.is_headset)
    {
		response.writeHead(200, {'Content-Type':contentType });
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