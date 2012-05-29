var HTTP = require('http');
var FS = require('fs');
var URL = require('url');

/*HTTP.createServer(function (request, response) {
    request.on('data',function(chunk){
        response.writeHead(200, {'Content-Type': 'text/plain'});
        response.write(chunk);
        response.end('Hello World\n');
    });
    
}).listen(8000);
*/

var SVR_PORT = 8080;
var ACCESS_LOG_FILE = "./logs/access.log";
var ERROR_LOG_FILE = "./logs/error.log";
var DBG_LOG_FILE = "./logs/debug.log";

var LOG_DBG = 0;
var LOG_INFO = 1;
var LOG_ACCESS = 2;
var LOG_ERROR = 3;


var g_dbgFile = null;
function main()
{
    g_dbgFile = FS.openSync(DBG_LOG_FILE,"a+");
    var webSvr = HTTP.createServer(function (request, response){
        log(LOG_INFO, "A request in!");
        var origUrl = proxy_resolve_request(request);
        if(origUrl)
        {
            log(LOG_INFO,"origUrl:" + origUrl.protocol+"//" + origUrl.host+":" + origUrl.port+ origUrl.path);
            htmlContent = proxy_request(origUrl,function(header,body){
                //print_r(header);
                if(header['content-type'] == 'image/jpeg')
                    ;//body = body.toString();
                else
                    body = proxy_rewrite(body.toString(),request);
                proxy_response_client(response,body, header)
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

function helper_getRefUrl(reqst)
{
    return reqst.url.replace(/http\/.*$/i,'');
}

/*
    proxy url:http://proxy/rproxy/http/host:port/path
*/
function proxy_resolve_request(request)
{
    if(request === null && typeof(request) != 'object')
    {
        return null;
    }
    //http://localhost:8080/rproxy/http/test/abc.com1
    var proxyUrlReg = /(https?:\/\/[^\/]+)?\/rproxy\/(https?)\/([^:\/]+)(:\d+)?(\/.*)?$/i;
    request.url = request.url.toLowerCase();
    log(LOG_DBG,"request.url = " + request.url);
    var ret = null;
    if(ret = request.url.match(proxyUrlReg))
    {
        if(ret[4] == null)
        {
            if(ret[2] == 'http')
                ret[4] = 80;
            else if(ret[2] == 'https')
                ret[4] = 443; 
        }
        
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
    HTTP.get(urlObj, function(res) {
      res.on('data',function(body){
            callback(res.headers,body);
      });
    }).on('error', function(e) {
       //log(LOG_ERROR,e.getMessage());
       print_r(e);
    });
}

function proxy_rewrite(data,request)
{
    //log(LOG_DBG,"typeof(data):",typeof(data));
    //print_r(data);
    return data.replace(/([\s\S]*src=['"])([^'"]*)(['"][\s\S]*)/g, function() { 
        return (arguments[1]+helper_trans_url(arguments[2],request.url)+arguments[3]);
    });
}

function helper_trans_url(url,refUrl)
{
    log(LOG_DBG,"helper_trans_url,url=" + url);
    var ret = URL.resolve(refUrl,url);
    log(LOG_DBG,"helper_trans_url,ret=" + ret);
    return ret;
}

function proxy_response_client(response,data,header)
{
    var contentType = 'text/html';
    if(header)
        contentType = header['content-type'];
    
    log(LOG_DBG,"proxy_response_client,contentType=" + contentType);
    
    response.writeHead(200, {'Content-Type':contentType });
    response.write(data);
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