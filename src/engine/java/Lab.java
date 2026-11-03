package engine;

import java.util.LinkedHashMap;
import java.util.Map;
import org.teavm.jso.JSBody;

/**
 * Synchronous bridge from Java to the shared lab world.
 *
 * UWAGA: ten plik NIE jest kompilowany ze źródła w przeglądarce —
 * wbudowany w compiler.wasm javac ma stack overflow na @JSBody.
 * Most leci jako prekompilowany public/vendor/teavm/bridge/Lab.class
 * (compiler.addClassFile). Po zmianach: bash scripts/build-teavm-bridge.sh
 * (wymaga JDK, JAVA_HOME). Weryfikacja: npm run test:teavm-sync.
 */
public final class Lab {
    private Lab() {}

    private static int nextCallId = 1;
    private static final Map<Integer, String> callResults = new LinkedHashMap<>();
    private static final int MAX_CALL_RESULTS = 128;

    @JSBody(params = "name", script = "return self.__lab.spawn(name);")
    private static native int jsSpawn(String name);

    @JSBody(params = "objectId", script = "self.__lab.destroy(objectId);")
    private static native void jsDestroy(int objectId);

    @JSBody(params = { "objectId", "kind" }, script = "return self.__lab.attachComponent(objectId, kind);")
    private static native int jsAttachComponent(int objectId, String kind);

    @JSBody(params = { "objectId", "specJson" }, script = "self.__lab.attachRenderer(objectId, specJson);")
    private static native void jsAttachRenderer(int objectId, String specJson);

    @JSBody(params = { "objectId", "x", "y" }, script = "self.__lab.setPosition(objectId, x, y);")
    private static native void jsSetPosition(int objectId, double x, double y);

    @JSBody(params = { "compId", "prop", "value" }, script = "self.__lab.set(compId, prop, value);")
    private static native void jsSetProp(int compId, String prop, String value);

    @JSBody(params = { "compId", "prop" }, script = "return self.__lab.get(compId, prop);")
    private static native String jsGetProp(int compId, String prop);

    @JSBody(params = { "compId", "method", "argsJson" }, script = "return self.__lab.call(compId, method, argsJson);")
    private static native String jsCall(int compId, String method, String argsJson);

    @JSBody(params = "kind", script = "return self.__lab.findComponent(kind);")
    private static native int jsFindComponent(String kind);

    @JSBody(params = "objectId", script = "return self.__lab.posX(objectId);")
    private static native double jsPosX(int objectId);

    @JSBody(params = "objectId", script = "return self.__lab.posY(objectId);")
    private static native double jsPosY(int objectId);

    public static int spawn(String name) { return jsSpawn(name); }

    public static void destroyObject(int objectId) { jsDestroy(objectId); }

    public static int attachComponent(int objectId, String kind) {
        return jsAttachComponent(objectId, kind);
    }

    public static void attachRenderer(int objectId, String specJson) {
        jsAttachRenderer(objectId, specJson);
    }

    public static void setPosition(int objectId, double x, double y) {
        jsSetPosition(objectId, x, y);
    }

    public static void setProp(int compId, String prop, String value) {
        jsSetProp(compId, prop, value);
    }

    public static void setNum(int compId, String prop, double value) {
        setProp(compId, prop, Double.toString(value));
    }

    public static void pushProp(int compId, String name, String value) {
        setProp(compId, name, value);
    }

    public static int call(int compId, String method, String argsJson) {
        int callId = nextCallId++;
        callResults.put(callId, jsCall(compId, method, argsJson == null ? "[]" : argsJson));
        while (callResults.size() > MAX_CALL_RESULTS) {
            callResults.remove(callResults.keySet().iterator().next());
        }
        return callId;
    }

    public static String pollResult(int callId) {
        String result = callResults.get(callId);
        return result == null ? "" : result;
    }

    public static int findComponent(String kind) { return jsFindComponent(kind); }

    public static String getProp(int compId, String prop) { return jsGetProp(compId, prop); }

    public static double getNum(int compId, String prop) {
        try {
            String value = getProp(compId, prop);
            return value == null || value.isEmpty() ? 0 : Double.parseDouble(value);
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    public static double getX(int objectId) { return jsPosX(objectId); }

    public static double getY(int objectId) { return jsPosY(objectId); }

    /** Object handles are now the real WorldRegistry IDs, not client-side tokens. */
    public static int resolveId(int objectId) { return objectId; }
}
