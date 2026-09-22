package org.jahia.support.modulemanagement.store;

import com.sun.net.httpserver.HttpServer;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;

import java.io.IOException;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

/**
 * Fetch-side guarantees of the store index egress filter (JAHIA-SEC-271).
 *
 * <p>The server runs on loopback, so the tests enable the operator escape hatch to let the default
 * policy reach it. The redirect re-validation cases inject their own {@link StoreIndexUrlValidator.UrlPolicy}
 * instead, which is what lets them assert that <em>each hop</em> is checked and not just the first.</p>
 */
public class StoreIndexHttpFetcherTest {

    private HttpServer server;
    private String baseUrl;

    @Before
    public void startServer() throws IOException {
        server = HttpServer.create(new InetSocketAddress(InetAddress.getLoopbackAddress(), 0), 0);
        server.start();
        baseUrl = "http://127.0.0.1:" + server.getAddress().getPort();
        System.setProperty(StoreIndexUrlValidator.ALLOW_INTERNAL_HOSTS_PROPERTY, "true");
    }

    @After
    public void stopServer() {
        System.clearProperty(StoreIndexUrlValidator.ALLOW_INTERNAL_HOSTS_PROPERTY);
        server.stop(0);
    }

    private void serve(String path, int status, String body, String location) {
        server.createContext(path, exchange -> {
            if (location != null) {
                exchange.getResponseHeaders().add("Location", location);
            }
            byte[] payload = body.getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(status, payload.length);
            try (OutputStream out = exchange.getResponseBody()) {
                out.write(payload);
            }
        });
    }

    @Test
    public void fetchesTheBodyOfATwoHundredResponse() throws Exception {
        // Arrange
        serve("/modules.json", 200, "{\"modules\":[]}", null);

        // Act
        String json = StoreIndexHttpFetcher.fetchJson(baseUrl + "/modules.json");

        // Assert
        assertEquals("{\"modules\":[]}", json);
    }

    @Test
    public void followsARedirectUpToTheHopLimit() throws Exception {
        // Arrange
        serve("/start", 302, "", baseUrl + "/end");
        serve("/end", 200, "{\"ok\":true}", null);

        // Act
        String json = StoreIndexHttpFetcher.fetchJson(baseUrl + "/start");

        // Assert
        assertEquals("{\"ok\":true}", json);
    }

    @Test
    public void resolvesARelativeRedirectAgainstTheCurrentUrl() throws Exception {
        // Arrange
        serve("/rel", 302, "", "/target");
        serve("/target", 200, "{\"rel\":true}", null);

        // Act
        String json = StoreIndexHttpFetcher.fetchJson(baseUrl + "/rel");

        // Assert
        assertEquals("{\"rel\":true}", json);
    }

    @Test
    public void revalidatesEveryRedirectHopAgainstThePolicy() {
        // Arrange: hop 1 is allowed, hop 2 is not — exactly the bypass an unvalidated
        // HttpURLConnection redirect would hand an attacker.
        serve("/hop1", 302, "", baseUrl + "/blocked");
        serve("/blocked", 200, "should never be read", null);
        StoreIndexUrlValidator.UrlPolicy policy = url -> {
            if (url.contains("/blocked")) {
                throw new StoreIndexUrlRejectedException("policy refused " + url);
            }
        };

        // Act + Assert
        try {
            StoreIndexHttpFetcher.fetchJson(baseUrl + "/hop1", policy);
            fail("expected the redirect target to be rejected");
        } catch (StoreIndexUrlRejectedException e) {
            assertTrue(e.getMessage().contains("/blocked"));
        } catch (IOException e) {
            fail("expected a policy rejection, got " + e);
        }
    }

    @Test
    public void validatesTheInitialUrlBeforeOpeningAnyConnection() {
        // Arrange
        AtomicInteger hits = new AtomicInteger();
        server.createContext("/never", exchange -> {
            hits.incrementAndGet();
            exchange.sendResponseHeaders(200, 0);
            exchange.close();
        });
        StoreIndexUrlValidator.UrlPolicy refuseAll = url -> {
            throw new StoreIndexUrlRejectedException("refused " + url);
        };

        // Act
        try {
            StoreIndexHttpFetcher.fetchJson(baseUrl + "/never", refuseAll);
            fail("expected rejection");
        } catch (IOException expected) {
            // Assert
            assertEquals("no connection must be opened for a rejected URL", 0, hits.get());
        }
    }

    @Test
    public void stopsAfterTooManyRedirects() {
        // Arrange: a self-redirect loop.
        serve("/loop", 302, "", baseUrl + "/loop");

        // Act + Assert
        try {
            StoreIndexHttpFetcher.fetchJson(baseUrl + "/loop");
            fail("expected the redirect chain to be capped");
        } catch (IOException e) {
            assertTrue("message should mention redirects, was: " + e.getMessage(),
                    e.getMessage().toLowerCase().contains("redirect"));
        }
    }

    @Test
    public void rejectsARedirectWithoutALocationHeader() {
        // Arrange
        serve("/noloc", 302, "", null);

        // Act + Assert
        try {
            StoreIndexHttpFetcher.fetchJson(baseUrl + "/noloc");
            fail("expected an error for a Location-less redirect");
        } catch (IOException e) {
            assertTrue(e.getMessage().contains("Location"));
        }
    }

    @Test
    public void abortsAResponseLargerThanTheCap() {
        // Arrange
        StringBuilder oversized = new StringBuilder();
        for (int i = 0; i < 2048; i++) {
            oversized.append("0123456789");
        }
        serve("/big", 200, oversized.toString(), null);

        // Act + Assert
        try {
            StoreIndexHttpFetcher.fetchJson(baseUrl + "/big", StoreIndexUrlValidator::validate, 1024);
            fail("expected the oversized body to be refused");
        } catch (IOException e) {
            assertTrue("message should mention the size cap, was: " + e.getMessage(),
                    e.getMessage().contains("1024"));
        }
    }

    /**
     * Positive control for the regression test below: the pre-fix code path was a bare
     * {@code new URL(url).openConnection()}, and it <em>does</em> reach this listener. Without this
     * assertion the "zero hits" test could pass for the wrong reason — a listener that never
     * started, or a path that was never registered — and silently stop testing anything.
     */
    @Test
    public void positiveControlAnUnvalidatedFetchDoesReachTheListener() throws Exception {
        // Arrange
        AtomicInteger listenerHits = new AtomicInteger();
        server.createContext("/unvalidated", exchange -> {
            listenerHits.incrementAndGet();
            exchange.sendResponseHeaders(200, 0);
            exchange.close();
        });

        // Act: the exact shape of the vulnerable code, with no policy in the way.
        HttpURLConnection connection = (HttpURLConnection) new URL(baseUrl + "/unvalidated").openConnection();
        connection.setConnectTimeout(2_000);
        connection.setReadTimeout(2_000);
        assertEquals(200, connection.getResponseCode());
        connection.disconnect();

        // Assert
        assertEquals("the listener oracle must be able to observe an outbound request",
                1, listenerHits.get());
    }

    /**
     * JAHIA-SEC-271 regression: the fiche's own proof-of-concept wrote
     * {@code storeModuleListUrl=http://<listener>/sec271-...} and observed the JVM connect to it
     * ~0.9s later. With the production policy in force the connection must never be attempted, and
     * an independent listener must record nothing — the same oracle the original PoC used.
     */
    @Test
    public void refusesTheSec271ProofOfConceptUrlWithoutTouchingTheListener() {
        // Arrange: production policy, i.e. no escape hatch.
        System.clearProperty(StoreIndexUrlValidator.ALLOW_INTERNAL_HOSTS_PROPERTY);
        AtomicInteger listenerHits = new AtomicInteger();
        server.createContext("/sec271-ssrf-proof", exchange -> {
            listenerHits.incrementAndGet();
            exchange.sendResponseHeaders(200, 0);
            exchange.close();
        });

        // Act
        try {
            StoreIndexHttpFetcher.fetchJson(baseUrl + "/sec271-ssrf-proof");
            fail("expected the loopback store index URL to be refused");
        } catch (StoreIndexUrlRejectedException expected) {
            // Assert
            assertEquals("the SSRF sink must not be reached", 0, listenerHits.get());
        } catch (IOException e) {
            fail("expected a policy rejection, got " + e);
        }
    }

    @Test
    public void readBoundedReturnsShortStreamsUnchanged() throws Exception {
        // Arrange
        byte[] payload = "hello".getBytes(StandardCharsets.UTF_8);

        // Act
        byte[] read = StoreIndexHttpFetcher.readBounded(new java.io.ByteArrayInputStream(payload), 1024);

        // Assert
        assertEquals("hello", new String(read, StandardCharsets.UTF_8));
    }
}
