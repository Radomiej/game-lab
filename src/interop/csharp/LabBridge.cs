using System.Globalization;
using System.Runtime.InteropServices.JavaScript;
using System.Text;

namespace LabBridge;

internal static partial class JavaScript
{
    [JSImport("invoke", "LabBridge")]
    internal static partial string Invoke(string operation, string payload);
}

/// <summary>
/// Synchronous C# facade over Game Lab's shared WorldRegistry.
/// JSON is encoded locally so the bridge stays compatible with the trimmed
/// .NET runtime bundled by WasmSharp.
/// </summary>
public static class Lab
{
    private static string Object(params (string Key, object? Value)[] fields)
    {
        var parts = new string[fields.Length];
        for (var i = 0; i < fields.Length; i++)
            parts[i] = Quote(fields[i].Key) + ":" + Value(fields[i].Value);
        return "{" + string.Join(",", parts) + "}";
    }

    private static string Array(object?[] values)
    {
        var parts = new string[values.Length];
        for (var i = 0; i < values.Length; i++) parts[i] = Value(values[i]);
        return "[" + string.Join(",", parts) + "]";
    }

    private static string Value(object? value)
    {
        if (value is null) return "null";
        if (value is string text) return Quote(text);
        if (value is bool boolean) return boolean ? "true" : "false";
        if (value is object?[] items) return Array(items);
        if (value is IFormattable number)
            return number.ToString(null, CultureInfo.InvariantCulture) ?? "0";
        throw new NotSupportedException($"Lab interop can't serialize {value.GetType().FullName}");
    }

    private static string Quote(string value)
    {
        var result = new StringBuilder(value.Length + 2).Append('"');
        foreach (var c in value)
        {
            switch (c)
            {
                case '"': result.Append("\\\""); break;
                case '\\': result.Append("\\\\"); break;
                case '\b': result.Append("\\b"); break;
                case '\f': result.Append("\\f"); break;
                case '\n': result.Append("\\n"); break;
                case '\r': result.Append("\\r"); break;
                case '\t': result.Append("\\t"); break;
                default:
                    if (c < 0x20) result.Append("\\u").Append(((int)c).ToString("x4", CultureInfo.InvariantCulture));
                    else result.Append(c);
                    break;
            }
        }
        return result.Append('"').ToString();
    }

    private static string Number(double value) =>
        value.ToString(CultureInfo.InvariantCulture);

    private static string Send(string operation, string payload = "{}") =>
        JavaScript.Invoke(operation, payload);

    private static string? ReadString(string json)
    {
        json = json.Trim();
        if (json == "null") return null;
        if (json.Length < 2 || json[0] != '"' || json[^1] != '"')
            throw new FormatException("Expected a JSON string from the Lab host");
        var result = new StringBuilder(json.Length - 2);
        for (var i = 1; i < json.Length - 1; i++)
        {
            var c = json[i];
            if (c != '\\') { result.Append(c); continue; }
            if (++i >= json.Length - 1) throw new FormatException("Incomplete JSON escape");
            switch (json[i])
            {
                case '"': result.Append('"'); break;
                case '\\': result.Append('\\'); break;
                case '/': result.Append('/'); break;
                case 'b': result.Append('\b'); break;
                case 'f': result.Append('\f'); break;
                case 'n': result.Append('\n'); break;
                case 'r': result.Append('\r'); break;
                case 't': result.Append('\t'); break;
                case 'u':
                    if (i + 4 >= json.Length) throw new FormatException("Incomplete JSON unicode escape");
                    result.Append((char)int.Parse(json.Substring(i + 1, 4), NumberStyles.HexNumber, CultureInfo.InvariantCulture));
                    i += 4;
                    break;
                default: throw new FormatException("Invalid JSON escape");
            }
        }
        return result.ToString();
    }

    private static T? Read<T>(string json)
    {
        json = json.Trim();
        if (json == "null") return default;
        var type = Nullable.GetUnderlyingType(typeof(T)) ?? typeof(T);
        object value;
        if (type == typeof(string)) value = ReadString(json)!;
        else if (type == typeof(bool)) value = json == "true";
        else if (type == typeof(int)) value = int.Parse(json, NumberStyles.Integer, CultureInfo.InvariantCulture);
        else if (type == typeof(long)) value = long.Parse(json, NumberStyles.Integer, CultureInfo.InvariantCulture);
        else if (type == typeof(double)) value = double.Parse(json, NumberStyles.Float, CultureInfo.InvariantCulture);
        else if (type == typeof(float)) value = float.Parse(json, NumberStyles.Float, CultureInfo.InvariantCulture);
        else if (type == typeof(decimal)) value = decimal.Parse(json, NumberStyles.Float, CultureInfo.InvariantCulture);
        else throw new NotSupportedException($"Lab interop can't deserialize {type.FullName}; use a primitive or CallJson");
        return (T)value;
    }

    public static int Spawn(string name = "") => Read<int>(Send("spawn", Object(("name", name))));
    public static void DestroyObject(int objectId) => _ = Send("destroyObject", Object(("objectId", objectId)));
    public static void SetPosition(int objectId, double x, double y) =>
        _ = Send("setPosition", Object(("objectId", objectId), ("x", x), ("y", y)));
    public static (double X, double Y)? GetPosition(int objectId)
    {
        var json = Send("getPosition", Object(("objectId", objectId))).Trim();
        if (json == "null") return null;
        var pair = json.Trim('[', ']').Split(',');
        if (pair.Length != 2) throw new FormatException("Expected [x,y] from Lab.GetPosition");
        return (
            double.Parse(pair[0], NumberStyles.Float, CultureInfo.InvariantCulture),
            double.Parse(pair[1], NumberStyles.Float, CultureInfo.InvariantCulture));
    }

    public static void AttachRenderer(int objectId, string texture, double width, double height) =>
        _ = Send("attachRenderer", "{\"objectId\":" + objectId.ToString(CultureInfo.InvariantCulture) +
            ",\"spec\":{\"type\":\"sprite\",\"texture\":" + Quote(texture) +
            ",\"width\":" + Number(width) + ",\"height\":" + Number(height) + "}}");
    public static void AttachRectRenderer(int objectId, double width, double height, string color = "#76b9f2") =>
        _ = Send("attachRenderer", "{\"objectId\":" + objectId.ToString(CultureInfo.InvariantCulture) +
            ",\"spec\":{\"type\":\"rect\",\"width\":" + Number(width) +
            ",\"height\":" + Number(height) + ",\"color\":" + Quote(color) + "}}");
    public static void AttachCircleRenderer(int objectId, double radius, string color = "#76b9f2") =>
        _ = Send("attachRenderer", "{\"objectId\":" + objectId.ToString(CultureInfo.InvariantCulture) +
            ",\"spec\":{\"type\":\"circle\",\"radius\":" + Number(radius) +
            ",\"color\":" + Quote(color) + "}}");

    public static int? GetComponent(int objectId, string kind) =>
        Read<int?>(Send("getComponent", Object(("objectId", objectId), ("kind", kind))));
    public static int FindComponent(string kind) =>
        Read<int?>(Send("findComponent", Object(("kind", kind)))) ?? 0;
    public static double GetNum(int componentId, string property) =>
        Read<double>(Send("getProp", Object(("componentId", componentId), ("property", property))));
    public static string GetStr(int componentId, string property) =>
        Read<string?>(Send("getProp", Object(("componentId", componentId), ("property", property)))) ?? "";
    public static T? GetProp<T>(int componentId, string property) =>
        Read<T>(Send("getProp", Object(("componentId", componentId), ("property", property))));
    public static void SetNum(int componentId, string property, double value) =>
        _ = Send("setProp", Object(("componentId", componentId), ("property", property), ("value", value)));
    public static void SetStr(int componentId, string property, string value) =>
        _ = Send("setProp", Object(("componentId", componentId), ("property", property), ("value", value)));
    public static void SetProp<T>(int componentId, string property, T value) =>
        _ = Send("setProp", Object(("componentId", componentId), ("property", property), ("value", value)));

    /// <summary>Returns the raw JSON result so callers can inspect non-primitive results.</summary>
    public static string Call(int componentId, string method, params object?[] args) =>
        Send("call", Object(("componentId", componentId), ("method", method), ("args", args)));
    public static T? Call<T>(int componentId, string method, params object?[] args) =>
        Read<T>(Call(componentId, method, args));
    public static string CallByKind(string kind, string method, params object?[] args) =>
        Send("callByKind", Object(("kind", kind), ("method", method), ("args", args)));
    public static T? CallByKind<T>(string kind, string method, params object?[] args) =>
        Read<T>(CallByKind(kind, method, args));

    public static bool IsKeyDown(string code) =>
        Read<bool>(Send("isKeyDown", Object(("code", code))));
    public static bool IsKeyPressed(string code) =>
        Read<bool>(Send("isKeyPressed", Object(("code", code))));
    public static int Width() => Read<int>(Send("width"));
    public static int Height() => Read<int>(Send("height"));
    public static void Print(string message) =>
        _ = Send("print", Object(("message", message)));

}
