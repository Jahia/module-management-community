package org.jahia.support.modulemanagement.store;

import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.MalformedURLException;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * Fetches the store module catalogue JSON under the egress policy of {@link StoreIndexUrlValidator}
 * (JAHIA-SEC-271, CWE-918).
 *
 * <p>Validating only the configured URL would leave the control trivially bypassable: an allowed
 * https host can answer {@code 302 Location: http://169.254.169.254/...} and
 * {@link HttpURLConnection} follows that on its own. So redirects are turned off at the connection
 * level and followed here instead, re-checking every hop against the same policy.</p>
 */
public final class StoreIndexHttpFetcher {

    /** Cap the download to defend against an oversized / malicious response body. */
    public static final int MAX_STORE_INDEX_BYTES = 32 * 1024 * 1024; // 32 MB

    private static final int MAX_REDIRECTS = 5;
    private static final int CONNECT_TIMEOUT_MS = 10_000;
    private static final int READ_TIMEOUT_MS = 60_000;
    private static final int READ_CHUNK_BYTES = 8192;

    private StoreIndexHttpFetcher() {
        // utility class
    }

    /**
     * Fetch the catalogue JSON using the production egress policy and the default size cap.
     */
    public static String fetchJson(String url) throws IOException {
        return fetchJson(url, StoreIndexUrlValidator::validate, MAX_STORE_INDEX_BYTES);
    }

    /**
     * Fetch the catalogue JSON under an explicit policy. Exposed for tests that need to assert the
     * per-hop re-validation without standing up an internal host.
     */
    public static String fetchJson(String url, StoreIndexUrlValidator.UrlPolicy policy) throws IOException {
        return fetchJson(url, policy, MAX_STORE_INDEX_BYTES);
    }

    /**
     * @param url      the store module index URL
     * @param policy   admission policy applied to the initial URL and to every redirect target
     * @param maxBytes hard cap on the response body
     * @return the response body decoded as UTF-8
     * @throws StoreIndexUrlRejectedException if the URL, or any redirect target, fails the policy
     * @throws IOException                    on a transport error, a redirect loop or an oversized body
     */
    public static String fetchJson(String url, StoreIndexUrlValidator.UrlPolicy policy, int maxBytes) throws IOException {
        String current = url;
        for (int hop = 0; hop <= MAX_REDIRECTS; hop++) {
            policy.check(current);
            HttpURLConnection connection = open(current);
            try {
                int status = connection.getResponseCode();
                if (!isRedirect(status)) {
                    try (InputStream in = new BufferedInputStream(connection.getInputStream())) {
                        return new String(readBounded(in, maxBytes), StandardCharsets.UTF_8);
                    }
                }
                current = resolveRedirect(current, connection.getHeaderField("Location"));
            } finally {
                connection.disconnect();
            }
        }
        throw new IOException("Store module index fetch aborted after more than " + MAX_REDIRECTS
                + " redirects starting from " + url);
    }

    private static HttpURLConnection open(String url) throws IOException {
        HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
        // Redirects are followed by this class so every hop goes back through the policy.
        connection.setInstanceFollowRedirects(false);
        connection.setConnectTimeout(CONNECT_TIMEOUT_MS);
        connection.setReadTimeout(READ_TIMEOUT_MS);
        connection.setRequestProperty("Accept", "application/json");
        return connection;
    }

    private static boolean isRedirect(int status) {
        return status == HttpURLConnection.HTTP_MOVED_PERM
                || status == HttpURLConnection.HTTP_MOVED_TEMP
                || status == HttpURLConnection.HTTP_SEE_OTHER
                || status == 307
                || status == 308;
    }

    private static String resolveRedirect(String currentUrl, String location) throws IOException {
        if (location == null || location.trim().isEmpty()) {
            throw new IOException("Store module index fetch got a redirect without a Location header from " + currentUrl);
        }
        try {
            return new URL(new URL(currentUrl), location.trim()).toExternalForm();
        } catch (MalformedURLException e) {
            throw new IOException("Store module index fetch got an unusable redirect Location '" + location
                    + "' from " + currentUrl, e);
        }
    }

    /**
     * Read at most {@code maxBytes} from {@code in}, aborting with an {@link IOException} if the
     * stream exceeds the cap — an unbounded read could exhaust the heap.
     */
    public static byte[] readBounded(InputStream in, int maxBytes) throws IOException {
        ByteArrayOutputStream buffer = new ByteArrayOutputStream();
        byte[] chunk = new byte[READ_CHUNK_BYTES];
        int total = 0;
        int read;
        while ((read = in.read(chunk)) != -1) {
            total += read;
            if (total > maxBytes) {
                throw new IOException("Store index response exceeds the maximum allowed size of " + maxBytes + " bytes");
            }
            buffer.write(chunk, 0, read);
        }
        return buffer.toByteArray();
    }
}
