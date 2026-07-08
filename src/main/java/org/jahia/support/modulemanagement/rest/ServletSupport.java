package org.jahia.support.modulemanagement.rest;

import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;

/**
 * Shared helpers for the module-management REST servlets.
 *
 * <p>Centralises CORS handling, JSON escaping and the common JSON response literals so the
 * individual servlets stay small and behave consistently. All methods are static and
 * side-effect free apart from the response mutations they explicitly perform.
 */
final class ServletSupport {

    static final String ORIGIN_HEADER = "Origin";
    static final String CONTENT_TYPE_JSON = "application/json;charset=UTF-8";
    static final String ERROR_AUTH_REQUIRED = "{\"error\":\"Authentication required\"}";
    static final String ERROR_MULTIPART_REQUIRED = "{\"error\":\"Multipart request required\"}";

    private static final String ACCESS_CONTROL_ALLOW_ORIGIN = "Access-Control-Allow-Origin";
    private static final String VARY = "Vary";

    private ServletSupport() {
        // utility class — no instances
    }

    /**
     * Reflects the request {@code Origin} header into {@code Access-Control-Allow-Origin}
     * only when it points at the same host/port the request was served on (same-origin).
     * For any other (cross-origin) value the header is intentionally omitted so the browser
     * blocks the response — this avoids reflecting an arbitrary attacker-controlled origin.
     */
    static void applyCorsHeaders(HttpServletRequest request, HttpServletResponse response) {
        String origin = request.getHeader(ORIGIN_HEADER);
        if (origin != null && isSameOrigin(request, origin)) {
            response.setHeader(ACCESS_CONTROL_ALLOW_ORIGIN, origin);
            response.setHeader(VARY, ORIGIN_HEADER);
        }
    }

    /**
     * Returns {@code true} when {@code origin} (a value such as {@code https://host:443})
     * matches the scheme/host/port the current request was served on.
     */
    private static boolean isSameOrigin(HttpServletRequest request, String origin) {
        try {
            java.net.URI o = java.net.URI.create(origin);
            String oScheme = o.getScheme();
            String oHost = o.getHost();
            if (oScheme == null || oHost == null) {
                return false;
            }
            int oPort = o.getPort() != -1 ? o.getPort() : defaultPort(oScheme);
            int reqPort = request.getServerPort();
            return oScheme.equalsIgnoreCase(request.getScheme())
                    && oHost.equalsIgnoreCase(request.getServerName())
                    && oPort == reqPort;
        } catch (IllegalArgumentException e) {
            return false;
        }
    }

    private static int defaultPort(String scheme) {
        return "https".equalsIgnoreCase(scheme) ? 443 : 80;
    }

    /** Minimal JSON string escaping — avoids a JSON library dependency. */
    static String toJsonString(String value) {
        if (value == null) {
            return "null";
        }
        return "\"" + value
                .replace("\\", "\\\\")
                .replace("\"", "\\\"")
                .replace("\n", "\\n")
                .replace("\r", "\\r")
                .replace("\t", "\\t") + "\"";
    }

    /**
     * Strips directory components and control characters from a browser-supplied file name so it
     * is safe to use in file operations and safe to write into logs (no CR/LF log injection).
     */
    static String sanitizeFileName(String raw, String fallback) {
        if (raw == null) {
            return fallback;
        }
        int lastSlash = Math.max(raw.lastIndexOf('/'), raw.lastIndexOf('\\'));
        String name = lastSlash >= 0 ? raw.substring(lastSlash + 1) : raw;
        return sanitizeForLog(name);
    }

    /**
     * Removes CR, LF and other ISO control characters from a value before it is logged or
     * reflected, defeating log-forging / response-splitting via user-controlled data.
     */
    static String sanitizeForLog(String value) {
        if (value == null) {
            return null;
        }
        StringBuilder sb = new StringBuilder(value.length());
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            if (!Character.isISOControl(c)) {
                sb.append(c);
            }
        }
        return sb.toString();
    }
}
