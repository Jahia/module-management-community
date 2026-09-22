package org.jahia.support.modulemanagement.store;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.net.InetAddress;
import java.net.URI;
import java.net.URISyntaxException;
import java.net.UnknownHostException;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;

/**
 * Egress filter for the store module index URL (JAHIA-SEC-271, CWE-918).
 *
 * <p>{@code storeModuleListUrl} is an OSGi configuration value, and the configuration file is
 * writable by anyone holding a config-write primitive against this component's PID. Because a write
 * to that file makes Felix SCR reactivate the component — which unconditionally schedules a store
 * index refresh — an attacker-supplied value turns straight into an outbound request from the Jahia
 * JVM. This class is what stands between that value and the socket.</p>
 *
 * <p>The policy is deliberately <strong>not</strong> configurable through OSGi: an allow-list stored
 * in the very file the attacker can overwrite would defend nothing. Operators who genuinely run an
 * internal mirror relax it with the JVM system property
 * {@value #ALLOW_INTERNAL_HOSTS_PROPERTY}, which is set at launch and is out of reach of any
 * configuration write.</p>
 *
 * <p>Known residual gap: the host is resolved here and resolved again by the JVM when the connection
 * is opened, so a resolver that answers differently between the two (DNS rebinding) is not covered.
 * Closing that would mean pinning the connection to the validated address and carrying the original
 * host in the {@code Host} header and TLS SNI by hand; it is out of scope for this control.</p>
 */
public final class StoreIndexUrlValidator {

    /**
     * JVM system property that relaxes the scheme and address policy for operators running an
     * internal store mirror. Set it at launch ({@code -D...=true}); it is intentionally not an OSGi
     * property, see the class javadoc.
     */
    public static final String ALLOW_INTERNAL_HOSTS_PROPERTY = "jahia.modulemanagement.storeIndex.allowInternalHosts";

    private static final Logger logger = LoggerFactory.getLogger(StoreIndexUrlValidator.class);

    private static final String SCHEME_HTTPS = "https";
    private static final String SCHEME_HTTP = "http";

    /**
     * Host names refused before any resolution, so a rejection never costs a DNS round trip and
     * never depends on what the local resolver happens to answer.
     */
    private static final Set<String> DENIED_HOST_NAMES = Collections.unmodifiableSet(new HashSet<>(Arrays.asList(
            "localhost",
            "localhost.localdomain",
            "metadata",
            "metadata.google.internal",
            "metadata.goog",
            "instance-data",
            "instance-data.ec2.internal")));

    // ── IPv4 ranges not covered by the InetAddress predicates ───────────────────
    private static final int IPV4_THIS_NETWORK = 0;          // 0.0.0.0/8
    private static final int IPV4_CGNAT_FIRST_OCTET = 100;   // 100.64.0.0/10, includes Alibaba metadata
    private static final int IPV4_CGNAT_LOW = 64;
    private static final int IPV4_CGNAT_HIGH = 127;
    private static final int IPV4_IETF_FIRST_OCTET = 192;    // 192.0.0.0/24 IETF protocol assignments
    private static final int IPV4_BENCHMARK_FIRST_OCTET = 198; // 198.18.0.0/15 benchmarking
    private static final int IPV4_BENCHMARK_LOW = 18;
    private static final int IPV4_BENCHMARK_HIGH = 19;
    private static final int IPV4_RESERVED_FIRST_OCTET = 255; // 255.0.0.0/8
    private static final int IPV4_BYTES = 4;
    private static final int IPV6_BYTES = 16;
    private static final int IPV6_UNIQUE_LOCAL_MASK = 0xFE;  // fc00::/7
    private static final int IPV6_UNIQUE_LOCAL_PREFIX = 0xFC;
    private static final int BYTE_MASK = 0xFF;

    private StoreIndexUrlValidator() {
        // utility class
    }

    /**
     * A URL admission policy. Production uses {@link #validate(String)}; the seam exists so the
     * fetcher's per-redirect-hop checking can be exercised without standing up an internal host.
     */
    @FunctionalInterface
    public interface UrlPolicy {
        void check(String url) throws StoreIndexUrlRejectedException;
    }

    /**
     * @return {@code true} when the operator has explicitly opted out of the egress policy.
     */
    public static boolean isInternalHostsAllowed() {
        return Boolean.getBoolean(ALLOW_INTERNAL_HOSTS_PROPERTY);
    }

    /**
     * Admit {@code candidate} as a store module index URL, or refuse it with a message an operator
     * can act on.
     *
     * @param candidate the configured or redirected-to URL
     * @throws StoreIndexUrlRejectedException if the URL is malformed, uses a scheme other than
     *                                        https, embeds credentials, or names a host that
     *                                        resolves into a non-routable / internal range
     */
    public static void validate(String candidate) throws StoreIndexUrlRejectedException {
        if (candidate == null || candidate.trim().isEmpty()) {
            throw reject("the store module index URL is null or blank");
        }
        String trimmed = candidate.trim();

        URI uri;
        try {
            uri = new URI(trimmed);
        } catch (URISyntaxException e) {
            throw reject("'" + trimmed + "' is not a valid URI: " + e.getReason());
        }
        if (!uri.isAbsolute()) {
            throw reject("'" + trimmed + "' is not an absolute URL");
        }
        if (uri.getUserInfo() != null) {
            throw reject("'" + trimmed + "' embeds credentials in the URL, which is not allowed");
        }
        String host = uri.getHost();
        if (host == null || host.isEmpty()) {
            throw reject("'" + trimmed + "' has no parseable host (IPv6 literals must be bracketed)");
        }

        boolean allowInternal = isInternalHostsAllowed();
        validateScheme(trimmed, uri.getScheme(), allowInternal);

        String hostName = host.toLowerCase(Locale.ROOT);
        if (!allowInternal && DENIED_HOST_NAMES.contains(hostName)) {
            throw rejectInternal("'" + trimmed + "' names the internal host '" + hostName + "'");
        }
        if (allowInternal) {
            logger.warn("Store module index URL '{}' bypasses the egress policy because {} is enabled — "
                            + "the module will issue requests to an internal or unencrypted endpoint",
                    trimmed, ALLOW_INTERNAL_HOSTS_PROPERTY);
            return;
        }
        validateResolvedAddresses(trimmed, host);
    }

    private static void validateScheme(String url, String scheme, boolean allowInternal) throws StoreIndexUrlRejectedException {
        String normalised = scheme == null ? "" : scheme.toLowerCase(Locale.ROOT);
        if (SCHEME_HTTPS.equals(normalised)) {
            return;
        }
        if (allowInternal && SCHEME_HTTP.equals(normalised)) {
            return;
        }
        if (SCHEME_HTTP.equals(normalised)) {
            throw rejectInternal("'" + url + "' uses plain http; only https is accepted");
        }
        throw reject("'" + url + "' uses the scheme '" + normalised + "'; only https is accepted");
    }

    private static void validateResolvedAddresses(String url, String host) throws StoreIndexUrlRejectedException {
        InetAddress[] addresses;
        try {
            addresses = InetAddress.getAllByName(host);
        } catch (UnknownHostException e) {
            throw StoreIndexUrlRejectedException.unresolvable("Store module index URL rejected — the host of '"
                    + url + "' cannot be resolved, so it cannot be vetted.");
        }
        for (InetAddress address : addresses) {
            if (isBlockedAddress(address)) {
                throw rejectInternal("'" + url + "' resolves to the non-routable or internal address "
                        + address.getHostAddress());
            }
        }
    }

    /**
     * @return {@code true} for loopback, wildcard, link-local (including the cloud metadata
     * endpoint), site-local, unique-local, carrier-grade-NAT, multicast and reserved addresses.
     */
    static boolean isBlockedAddress(InetAddress address) {
        if (address.isAnyLocalAddress()
                || address.isLoopbackAddress()
                || address.isLinkLocalAddress()
                || address.isSiteLocalAddress()
                || address.isMulticastAddress()) {
            return true;
        }
        byte[] raw = address.getAddress();
        if (raw.length == IPV4_BYTES) {
            return isBlockedIpv4(raw);
        }
        if (raw.length == IPV6_BYTES) {
            return (raw[0] & IPV6_UNIQUE_LOCAL_MASK) == IPV6_UNIQUE_LOCAL_PREFIX;
        }
        // Unknown address family: refuse rather than guess.
        return true;
    }

    private static boolean isBlockedIpv4(byte[] raw) {
        int first = raw[0] & BYTE_MASK;
        int second = raw[1] & BYTE_MASK;
        int third = raw[2] & BYTE_MASK;
        if (first == IPV4_THIS_NETWORK || first == IPV4_RESERVED_FIRST_OCTET) {
            return true;
        }
        if (first == IPV4_CGNAT_FIRST_OCTET && second >= IPV4_CGNAT_LOW && second <= IPV4_CGNAT_HIGH) {
            return true;
        }
        if (first == IPV4_IETF_FIRST_OCTET && second == 0 && third == 0) {
            return true;
        }
        return first == IPV4_BENCHMARK_FIRST_OCTET && second >= IPV4_BENCHMARK_LOW && second <= IPV4_BENCHMARK_HIGH;
    }

    private static StoreIndexUrlRejectedException reject(String reason) {
        return new StoreIndexUrlRejectedException("Store module index URL rejected — " + reason + ".");
    }

    private static StoreIndexUrlRejectedException rejectInternal(String reason) {
        return new StoreIndexUrlRejectedException("Store module index URL rejected — " + reason
                + ". Set -D" + ALLOW_INTERNAL_HOSTS_PROPERTY + "=true on the JVM if this endpoint is a"
                + " deliberate internal mirror.");
    }
}
