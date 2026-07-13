package org.jahia.support.modulemanagement.rest;

import org.junit.Test;

import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * S16 — {@code ServletSupport.isSameOrigin} / {@code applyCorsHeaders} reflect the CORS
 * Access-Control-Allow-Origin header ONLY on an exact scheme+host+port match (U10). S18 — the
 * filename/log sanitisers strip traversal and CR/LF injection.
 */
public class ServletSupportTest {

    private static final String ACAO = "Access-Control-Allow-Origin";

    private HttpServletRequest servedOn(String scheme, String host, int port) {
        HttpServletRequest req = mock(HttpServletRequest.class);
        when(req.getScheme()).thenReturn(scheme);
        when(req.getServerName()).thenReturn(host);
        when(req.getServerPort()).thenReturn(port);
        return req;
    }

    // ── S16: isSameOrigin ─────────────────────────────────────────────────────────
    @Test
    public void isSameOrigin_exactMatch_true() {
        HttpServletRequest req = servedOn("https", "host", 443);
        // implicit 443 for https
        assertThat(ServletSupport.isSameOrigin(req, "https://host")).isTrue();
    }

    @Test
    public void isSameOrigin_schemeMismatch_false() {
        HttpServletRequest req = servedOn("https", "host", 443);
        assertThat(ServletSupport.isSameOrigin(req, "http://host")).isFalse();
    }

    @Test
    public void isSameOrigin_hostMismatch_false() {
        HttpServletRequest req = servedOn("https", "host", 443);
        assertThat(ServletSupport.isSameOrigin(req, "https://evil")).isFalse();
    }

    @Test
    public void isSameOrigin_portMismatch_false() {
        HttpServletRequest req = servedOn("https", "host", 443);
        assertThat(ServletSupport.isSameOrigin(req, "https://host:8443")).isFalse();
    }

    @Test
    public void isSameOrigin_garbageOrigin_false() {
        HttpServletRequest req = servedOn("https", "host", 443);
        assertThat(ServletSupport.isSameOrigin(req, "not a uri")).isFalse();
    }

    // ── S16: applyCorsHeaders reflects only same-origin ───────────────────────────
    @Test
    public void applyCorsHeaders_sameOrigin_reflectsHeader() {
        HttpServletRequest req = servedOn("https", "host", 443);
        when(req.getHeader("Origin")).thenReturn("https://host");
        HttpServletResponse resp = mock(HttpServletResponse.class);

        ServletSupport.applyCorsHeaders(req, resp);

        verify(resp).setHeader(ACAO, "https://host");
    }

    @Test
    public void applyCorsHeaders_crossOrigin_noHeader() {
        HttpServletRequest req = servedOn("https", "host", 443);
        when(req.getHeader("Origin")).thenReturn("https://evil");
        HttpServletResponse resp = mock(HttpServletResponse.class);

        ServletSupport.applyCorsHeaders(req, resp);

        verify(resp, never()).setHeader(eq(ACAO), any());
    }

    @Test
    public void applyCorsHeaders_nullOrigin_noHeader() {
        HttpServletRequest req = servedOn("https", "host", 443);
        when(req.getHeader("Origin")).thenReturn(null);
        HttpServletResponse resp = mock(HttpServletResponse.class);

        ServletSupport.applyCorsHeaders(req, resp);

        verify(resp, never()).setHeader(eq(ACAO), any());
    }

    // ── S18: sanitizeFileName / sanitizeForLog ────────────────────────────────────
    @Test
    public void sanitizeFileName_stripsDirectoryComponents() {
        assertThat(ServletSupport.sanitizeFileName("../../evil.jar", "fallback")).isEqualTo("evil.jar");
        assertThat(ServletSupport.sanitizeFileName("a/b\\c.jar", "fallback")).isEqualTo("c.jar");
        assertThat(ServletSupport.sanitizeFileName(null, "fallback")).isEqualTo("fallback");
    }

    @Test
    public void sanitizeFileName_stripsControlChars() {
        String out = ServletSupport.sanitizeFileName("mod\r\n.jar", "fallback");
        assertThat(out).doesNotContain("\r").doesNotContain("\n");
    }

    @Test
    public void sanitizeForLog_removesCrLf() {
        assertThat(ServletSupport.sanitizeForLog("x\r\nFAKE")).isEqualTo("xFAKE");
    }
}
