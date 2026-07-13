package org.jahia.support.modulemanagement.services;

import org.junit.Test;

import java.io.IOException;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * S7 / S8 — anti-RCE validation of an imported provisioning script. Security-critical (U14):
 * an imported snapshot's {@code provisioning.yaml} is fed to the Jahia provisioning manager, so
 * it must reject {@code karafCommand} operations and restrict {@code url:} values to embedded
 * bundles / {@code mvn:} coordinates / {@code https:} store URLs.
 */
public class ProvisioningLineValidationTest {

    private static final String EXTRACT_DIR_URI = "file:/tmp/extract-xyz/";

    private final ModuleManagementCommunityServiceImpl service = new ModuleManagementCommunityServiceImpl();

    // ── S7: karafCommand rejection ────────────────────────────────────────────────
    @Test
    public void validateProvisioningLine_karafCommand_rejected() {
        assertThatThrownBy(() -> service.validateProvisioningLine(
                "- karafCommand: \"feature:install evil\"", EXTRACT_DIR_URI))
                .isInstanceOf(IOException.class)
                .hasMessageContaining("karafCommand");
    }

    @Test
    public void validateProvisioningLine_karafCommandWithSurroundingSpaces_stillRejected() {
        // The guard is a substring match, so leading indentation / spacing does not evade it.
        assertThatThrownBy(() -> service.validateProvisioningLine(
                "   - karafCommand :  log:log 'x'", EXTRACT_DIR_URI))
                .isInstanceOf(IOException.class)
                .hasMessageContaining("karafCommand");
    }

    @Test
    public void validateImportedProvisioningYaml_multilineWithKarafCommand_rejected() {
        String yaml = "- installBundle:\n"
                + "  - url: 'https://store.jahia.com/mod.jar'\n"
                + "- karafCommand: \"feature:install evil\"\n";
        assertThatThrownBy(() -> service.validateImportedProvisioningYaml(yaml, EXTRACT_DIR_URI))
                .isInstanceOf(IOException.class)
                .hasMessageContaining("karafCommand");
    }

    /**
     * FINDING (for Stage 7): {@code validateProvisioningLine} matches {@code "karafCommand"}
     * case-sensitively, so a lowercase {@code karafcommand} key is NOT rejected by this guard.
     * Documented here as real behaviour; Jahia's provisioning parser treats the operation key as
     * case-sensitive, so a lowercase key is not a valid op — but the guard is narrower than the
     * spec assumed and should be reviewed.
     */
    @Test
    public void validateProvisioningLine_lowercaseKarafcommand_notCaught_documentsCaseSensitivity() {
        assertThatCode(() -> service.validateProvisioningLine(
                "- karafcommand: \"feature:install evil\"", EXTRACT_DIR_URI))
                .doesNotThrowAnyException();
    }

    // ── S8: url: allowlist ────────────────────────────────────────────────────────
    @Test
    public void validateProvisioningLine_allowedUrls_pass() {
        assertThatCode(() -> {
            service.validateProvisioningLine("  - url: '" + EXTRACT_DIR_URI + "mod.jar'", EXTRACT_DIR_URI);
            service.validateProvisioningLine("  - url: 'mvn:org.example/mod/1.0'", EXTRACT_DIR_URI);
            service.validateProvisioningLine("  - url: 'https://store.jahia.com/x.jar'", EXTRACT_DIR_URI);
        }).doesNotThrowAnyException();
    }

    @Test
    public void validateProvisioningLine_httpUrl_rejected() {
        assertThatThrownBy(() -> service.validateProvisioningLine(
                "  - url: 'http://evil/x'", EXTRACT_DIR_URI))
                .isInstanceOf(IOException.class)
                .hasMessageContaining("disallowed url");
    }

    @Test
    public void validateProvisioningLine_fileUrlOutsideExtractDir_rejected() {
        assertThatThrownBy(() -> service.validateProvisioningLine(
                "  - url: 'file:///etc/passwd'", EXTRACT_DIR_URI))
                .isInstanceOf(IOException.class)
                .hasMessageContaining("disallowed url");
    }

    @Test
    public void validateProvisioningLine_absoluteOutsidePath_rejected() {
        assertThatThrownBy(() -> service.validateProvisioningLine(
                "  - url: '/absolute/outside/x.jar'", EXTRACT_DIR_URI))
                .isInstanceOf(IOException.class)
                .hasMessageContaining("disallowed url");
    }

    @Test
    public void validateProvisioningLine_ftpUrl_rejected() {
        assertThatThrownBy(() -> service.validateProvisioningLine(
                "  - url: 'ftp://evil/x.jar'", EXTRACT_DIR_URI))
                .isInstanceOf(IOException.class)
                .hasMessageContaining("disallowed url");
    }

    @Test
    public void validateProvisioningLine_commentLineIgnored() {
        // Comment lines are stripped by validateImportedProvisioningYaml before per-line validation.
        assertThatCode(() -> service.validateImportedProvisioningYaml(
                "# - karafCommand: this is only a comment\n", EXTRACT_DIR_URI))
                .doesNotThrowAnyException();
    }
}
