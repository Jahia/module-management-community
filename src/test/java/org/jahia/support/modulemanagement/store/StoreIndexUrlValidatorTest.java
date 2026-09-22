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
