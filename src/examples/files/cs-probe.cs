using System;
using System.Net.Http;
var http = new HttpClient();
try {
    var body = await http.GetStringAsync("/index.html");
    Console.WriteLine("HTTP OK len=" + body.Length);
} catch (Exception e) {
    Console.WriteLine("HTTP FAIL " + e.GetType().Name + ": " + e.Message);
}
