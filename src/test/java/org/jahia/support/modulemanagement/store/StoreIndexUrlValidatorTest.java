package org.jahia.support.modulemanagement.store;

import org.junit.After;
import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

/**
 * Egress policy for the store module index URL (JAHIA-SEC-271 / CWE-918).
 *
 * <p>Every case below uses either a literal IP address or a host name that is rejected before any
 * name resolution happens, so the suite never touches DNS and stays deterministic offline.</p>
 */
public class StoreIndexUrlValidatorTest {

    /** example.com — a stable public address, used as the "legitimate external host" stand-in. */
    private static final String PUBLIC_IP_URL = "https://93.184.216.34/modules-repository.moduleList.json";

    @After
    public void clearEscapeHatch() {
        System.clearProperty(StoreIndexUrlValidator.ALLOW_INTERNAL_HOSTS_PROPERTY);
    }

    private static void assertRejected(String url) {
        try {
            StoreIndexUrlValidator.validate(url);
            fail("expected the store index URL to be rejected: " + url);
        } catch (StoreIndexUrlRejectedException expected) {
            assertTrue("rejection message should name the offending URL, was: " + expected.getMessage(),
                    expected.getMessage() != null && !expected.getMessage().isEmpty());
        }
    }

    private static void assertAccepted(String url) throws StoreIndexUrlRejectedException {
        StoreIndexUrlValidator.validate(url);
    }

    // ── accepted ────────────────────────────────────────────────────────────────

    @Test
    public void acceptsHttpsUrlOnAPublicAddress() throws Exception {
        assertAccepted(PUBLIC_IP_URL);
    }

    @Test
    public void acceptsTheShippedDefaultStoreUrlWithoutResolvingIt() {
        // Arrange: the default is an https URL on a public host — the policy must never reject the
        // value the module ships with for a reason other than name resolution.
        String defaultUrl = "https://store.jahia.com/en/sites/private-app-store/contents/modules-repository.moduleList.json";

        // Act
        StoreIndexUrlRejectedException rejection = null;
        try {
            StoreIndexUrlValidator.validate(defaultUrl);
        } catch (StoreIndexUrlRejectedException e) {
            rejection = e;
        }

        // Assert: tolerate a DNS-less build machine, but nothing else.
        if (rejection != null) {
            assertTrue("default URL rejected for a non-DNS reason: " + rejection.getMessage(),
                    rejection.getMessage().contains("cannot be resolved"));
        }
    }

    // ── scheme ──────────────────────────────────────────────────────────────────

    @Test
    public void rejectsPlainHttpByDefault() {
        assertRejected("http://93.184.216.34/modules.json");
    }

    @Test
    public void rejectsFileScheme() {
        assertRejected("file:///etc/passwd");
    }

    @Test
    public void rejectsFtpScheme() {
        assertRejected("ftp://93.184.216.34/modules.json");
    }

    @Test
    public void rejectsSchemeRelativeUrl() {
        assertRejected("//93.184.216.34/modules.json");
    }

    // ── syntax ──────────────────────────────────────────────────────────────────

    @Test
    public void rejectsNullUrl() {
        assertRejected(null);
    }

    @Test
    public void rejectsBlankUrl() {
        assertRejected("   ");
    }

    @Test
    public void rejectsMalformedUrl() {
        assertRejected("https://exa mple.com/modules.json");
    }

    @Test
    public void rejectsUrlEmbeddingCredentials() {
        assertRejected("https://admin:secret@93.184.216.34/modules.json");
    }

    // ── host names denied before resolution ─────────────────────────────────────

    @Test
    public void rejectsLocalhostByName() {
        assertRejected("https://localhost/modules.json");
    }

    @Test
    public void rejectsGoogleCloudMetadataHostname() {
        assertRejected("https://metadata.google.internal/computeMetadata/v1/");
    }

    @Test
    public void rejectsBareMetadataHostname() {
        assertRejected("https://metadata/computeMetadata/v1/");
    }

    // ── addresses ───────────────────────────────────────────────────────────────

    @Test
    public void rejectsIpv4Loopback() {
        assertRejected("https://127.0.0.1:8999/sec271");
    }

    @Test
    public void rejectsIpv6Loopback() {
        assertRejected("https://[::1]:8999/sec271");
    }

    @Test
    public void rejectsWildcardAddress() {
        assertRejected("https://0.0.0.0/modules.json");
    }

    @Test
    public void rejectsCloudMetadataLinkLocalAddress() {
        assertRejected("https://169.254.169.254/latest/meta-data/iam/security-credentials/");
    }

    @Test
    public void rejectsPrivateClassAAddress() {
        assertRejected("https://10.0.0.5/modules.json");
    }

    @Test
    public void rejectsPrivateClassBAddress() {
        assertRejected("https://172.16.3.9/modules.json");
    }

    @Test
    public void rejectsPrivateClassCAddress() {
        assertRejected("https://192.168.1.10/modules.json");
    }

    @Test
    public void rejectsCarrierGradeNatAddressCoveringAlibabaMetadata() {
        assertRejected("https://100.100.100.200/latest/meta-data/");
    }

    @Test
    public void rejectsIpv6UniqueLocalAddress() {
        assertRejected("https://[fd00::1]/modules.json");
    }

    @Test
    public void rejectsIpv6LinkLocalAddress() {
        assertRejected("https://[fe80::1]/modules.json");
    }

    @Test
    public void rejectsMulticastAddress() {
        assertRejected("https://224.0.0.1/modules.json");
    }

    @Test
    public void rejectsIetfProtocolAssignmentsRange() {
        assertRejected("https://192.0.0.8/modules.json");
    }

    @Test
    public void rejectsBenchmarkingRange() {
        assertRejected("https://198.18.0.1/modules.json");
    }

    @Test
    public void rejectsIpv4MappedIpv6Loopback() {
        assertRejected("https://[::ffff:127.0.0.1]/modules.json");
    }

    // ── authority parser tricks ─────────────────────────────────────────────────
    // These are the shapes where java.net.URI and java.net.URL disagree, and they are the reason
    // the userInfo and null-host checks must not be relaxed or refactored away. In every case below
    // `new URL(...).getHost()` returns 169.254.169.254 — the checks are all that stand in the way.

    /**
     * Each of these parses as a <em>server-based</em> authority whose host is the internal address
     * and whose user info is the decoy name. Only the {@code getUserInfo() != null} check refuses
     * them; there is nothing internal-looking about the host string itself to catch.
     */
    @Test
    public void rejectsTheUserInfoDecoyFamily() {
        assertRejected("https://legit.example.com;@169.254.169.254/x");
        assertRejected("https://legit.example.com,@169.254.169.254/x");
        assertRejected("https://legit.example.com!@169.254.169.254/x");
        assertRejected("https://legit.example.com$@169.254.169.254/x");
        assertRejected("https://legit.example.com=@169.254.169.254/x");
        assertRejected("https://legit.example.com&@169.254.169.254/x");
        assertRejected("https://legit.example.com+@169.254.169.254/x");
        assertRejected("https://legit.example.com%09@169.254.169.254/x");
        assertRejected("https://legit.example.com%2f@169.254.169.254/x");
        assertRejected("https://legit.example.com:443:80@169.254.169.254/x");
    }

    @Test
    public void theUserInfoDecoyFamilyIsRejectedForEmbeddingCredentialsSpecifically() {
        // Arrange + Act: pin the reason, not just the outcome — if a refactor started reporting
        // these as "no parseable host" it would mean the authority is being parsed differently.
        try {
            StoreIndexUrlValidator.validate("https://legit.example.com;@169.254.169.254/x");
            fail("expected rejection");
        } catch (StoreIndexUrlRejectedException e) {
            // Assert
            assertTrue("was: " + e.getMessage(), e.getMessage().contains("embeds credentials"));
        }
    }

    @Test
    public void rejectsBackslashAndControlCharacterAuthorities() {
        // java.net.URL resolves the host of the first two to 169.254.169.254; URI refuses them, and
        // nothing is connected to unless URI parsing succeeded first.
        assertRejected("https://legit.example.com\\@169.254.169.254/x");
        assertRejected("https://legit.example.com]@169.254.169.254/x");
        assertRejected("https://legit.example.com\t@169.254.169.254/x");
        assertRejected("https://legit.example.com%00@169.254.169.254/x");
        assertRejected("https:/\\169.254.169.254/x");
    }

    @Test
    public void rejectsAuthoritiesThatLeaveUriWithoutAHost() {
        assertRejected("https://a@b@169.254.169.254/x");
        assertRejected("https://legit.example.com\u3002169.254.169.254/x"); // ideographic full stop
        assertRejected("https://legit.example.com:+443/x");
        assertRejected("https://169%2e254%2e169%2e254/x");
    }

    @Test
    public void rejectsAmbiguousLeadingZeroHostLabelsThatAProxyWouldReadAsOctal() {
        // This JVM reads 0177 as decimal 177, an inet_aton-based proxy reads it as octal 127, so the
        // validator's verdict would not describe where the request actually goes.
        assertRejected("https://0177.0.0.1/modules.json");
        assertRejected("https://0177.00.00.01/modules.json");
    }

    @Test
    public void acceptsAHostLabelThatMerelyStartsWithAZero() throws Exception {
        // Arrange: only all-digit labels are ambiguous; 0cdn is an ordinary host name and the rule
        // must not sweep it up. Checked through the resolver-free pass so the test stays offline.
        StoreIndexUrlValidator.validateSyntax("https://0cdn.example.com/modules.json");
        StoreIndexUrlValidator.validateSyntax("https://0.example.com/modules.json");
    }

    // ── resolver-free pass ──────────────────────────────────────────────────────

    @Test
    public void syntaxPassAcceptsAHostItNeverResolves() throws Exception {
        // Arrange + Act: a name that cannot resolve is fine for the syntax pass, which is what lets
        // component activation vet a config value without blocking on DNS.
        String host = StoreIndexUrlValidator.validateSyntax(
                "https://no-such-host.invalid/modules-repository.moduleList.json");

        // Assert
        assertEquals("no-such-host.invalid", host);
    }

    @Test
    public void syntaxPassStillEnforcesSchemeCredentialsAndInternalNames() {
        // Arrange: skipping DNS must not mean skipping everything else.
        String[] rejected = {
                "http://93.184.216.34/x",
                "file:///etc/passwd",
                "https://admin:secret@93.184.216.34/x",
                "https://localhost/x",
                "https://metadata.google.internal/x",
                "https://0177.0.0.1/x",
                "   ",
        };

        // Act + Assert
        for (String url : rejected) {
            try {
                StoreIndexUrlValidator.validateSyntax(url);
                fail("expected the syntax pass to reject " + url);
            } catch (StoreIndexUrlRejectedException expected) {
                assertTrue(expected.getMessage().length() > 0);
            }
        }
    }

    // ── IPv6 transition addresses that smuggle an IPv4 target ───────────────────
    // None of these are caught by InetAddress.isLoopbackAddress() and friends: Java hands back a
    // plain Inet6Address with every predicate false, so each one needs its own rule.

    @Test
    public void rejectsIpv4CompatibleIpv6Loopback() {
        assertRejected("https://[::127.0.0.1]/modules.json");
    }

    @Test
    public void rejectsIpv4CompatibleIpv6CloudMetadata() {
        assertRejected("https://[::169.254.169.254]/latest/meta-data/");
    }

    @Test
    public void rejectsNat64WrappedLoopback() {
        assertRejected("https://[64:ff9b::7f00:1]/modules.json");
    }

    @Test
    public void rejectsNat64WrappedCloudMetadata() {
        assertRejected("https://[64:ff9b::a9fe:a9fe]/latest/meta-data/");
    }

    @Test
    public void rejectsNat64WrappedPrivateAddress() {
        assertRejected("https://[64:ff9b::a00:5]/modules.json");
    }

    @Test
    public void acceptsNat64WrappedPublicAddressSoIpv6OnlyNodesStillReachTheStore() throws Exception {
        // Arrange: on an IPv6-only network the legitimate public store resolves through NAT64, so a
        // blanket refusal of 64:ff9b::/96 would break update detection rather than secure it.
        // 64:ff9b::5db8:d822 == 93.184.216.34.
        assertAccepted("https://[64:ff9b::5db8:d822]/modules-repository.moduleList.json");
    }

    @Test
    public void rejectsSixToFourAddress() {
        assertRejected("https://[2002:7f00:1::]/modules.json");
    }

    @Test
    public void rejectsTeredoAddress() {
        assertRejected("https://[2001:0:7f00:1::]/modules.json");
    }

    @Test
    public void acceptsAnOrdinaryGlobalIpv6AddressOutsideTheTeredoPrefix() throws Exception {
        // Arrange: only 2001:0000::/32 is Teredo — 2001:db8::/32 and friends are ordinary unicast
        // and must not be swept up with it.
        assertAccepted("https://[2001:4860:4860::8888]/modules.json");
    }

    @Test
    public void rejectsLocalUseNat64Prefix() {
        // 64:ff9b:1::/48 is RFC 8215's local-use translation prefix. It is refused outright rather
        // than unwrapped, because RFC 6052 puts the embedded IPv4 at a prefix-length-dependent
        // offset, so unwrapping one offset would leave the others open.
        assertRejected("https://[64:ff9b:1::7f00:1]/modules.json");
        assertRejected("https://[64:ff9b:1::a9fe:a9fe]/modules.json");
        assertRejected("https://[64:ff9b:1:0:0:7f00:1:0]/modules.json");
    }

    @Test
    public void rejectsIpv4TranslatedLoopbackAndMetadata() {
        // ::ffff:0:0/96 — the 0xFFFF sits two bytes earlier than in the IPv4-mapped form, so Java
        // returns an Inet6Address here and none of its predicates fire.
        assertRejected("https://[::ffff:0:7f00:1]/modules.json");
        assertRejected("https://[::ffff:0:a9fe:a9fe]/modules.json");
    }

    @Test
    public void rejectsClassEReservedRange() {
        assertRejected("https://240.0.0.1/modules.json");
        assertRejected("https://254.169.254.169/modules.json");
    }

    @Test
    public void rejectsSixToFourRelayAnycastRange() {
        // 192.88.99.0/24 is the IPv4 counterpart of the already-refused 2002::/16.
        assertRejected("https://192.88.99.1/modules.json");
    }

    // ── operator escape hatch ───────────────────────────────────────────────────

    @Test
    public void escapeHatchIsOffByDefault() {
        assertFalse(StoreIndexUrlValidator.isInternalHostsAllowed());
    }

    @Test
    public void escapeHatchAllowsAnInternalHttpMirror() throws Exception {
        // Arrange
        System.setProperty(StoreIndexUrlValidator.ALLOW_INTERNAL_HOSTS_PROPERTY, "true");

        // Act + Assert
        assertTrue(StoreIndexUrlValidator.isInternalHostsAllowed());
        assertAccepted("http://10.0.0.5:8080/internal-mirror/modules.json");
        assertAccepted("https://127.0.0.1:8999/modules.json");
    }

    @Test
    public void escapeHatchStillRejectsNonHttpSchemesAndMalformedUrls() {
        // Arrange: the hatch relaxes the address/scheme policy, never the syntax guarantees the
        // fetcher relies on.
        System.setProperty(StoreIndexUrlValidator.ALLOW_INTERNAL_HOSTS_PROPERTY, "true");

        // Act + Assert
        assertRejected("file:///etc/passwd");
        assertRejected("https://admin:secret@127.0.0.1/modules.json");
        assertRejected("   ");
    }

    // ── message quality ─────────────────────────────────────────────────────────

    @Test
    public void rejectionNamesTheResolvedAddressSoOperatorsCanDiagnoseIt() {
        // Act
        try {
            StoreIndexUrlValidator.validate("https://169.254.169.254/latest/meta-data/");
            fail("expected rejection");
        } catch (StoreIndexUrlRejectedException e) {
            // Assert
            assertTrue("message should name the blocked address, was: " + e.getMessage(),
                    e.getMessage().contains("169.254.169.254"));
            assertTrue("message should point at the escape hatch, was: " + e.getMessage(),
                    e.getMessage().contains(StoreIndexUrlValidator.ALLOW_INTERNAL_HOSTS_PROPERTY));
        }
    }

    @Test
    public void aPolicyBreachIsFlaggedAsSuchSoItCanBeLoggedAsAnError() {
        // Act
        try {
            StoreIndexUrlValidator.validate("https://169.254.169.254/latest/meta-data/");
            fail("expected rejection");
        } catch (StoreIndexUrlRejectedException e) {
            // Assert
            assertTrue("an internal address is a policy breach", e.isPolicyViolation());
        }
    }

    @Test
    public void anUnresolvableHostIsNotFlaggedAsAPolicyBreach() {
        // Arrange + Act
        StoreIndexUrlRejectedException e = StoreIndexUrlRejectedException.unresolvable("nope");

        // Assert: an offline node must not log an ERROR on every refresh.
        assertFalse(e.isPolicyViolation());
        assertTrue(e instanceof java.io.IOException);
    }

    @Test
    public void rejectionIsAnIoExceptionSoExistingFallbackHandlingKeepsWorking() {
        // Arrange + Act
        StoreIndexUrlRejectedException e = new StoreIndexUrlRejectedException("boom");

        // Assert
        assertTrue(e instanceof java.io.IOException);
        assertEquals("boom", e.getMessage());
    }
}
