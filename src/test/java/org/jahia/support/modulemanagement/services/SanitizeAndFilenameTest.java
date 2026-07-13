package org.jahia.support.modulemanagement.services;

import org.junit.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * S18 (partial) — {@code sanitizeForLog} neutralises CR/LF log-injection; and S30 support —
 * {@code getProvisioningFilenameWithDateAndExtension} builds the deterministic dated patch filename.
 */
public class SanitizeAndFilenameTest {

    @Test
    public void sanitizeForLog_stripsCrLfControlChars() {
        String forged = "user\r\nADMIN login succeeded";
        String out = ModuleManagementCommunityServiceImpl.sanitizeForLog(forged);

        assertThat(out).doesNotContain("\r").doesNotContain("\n");
        // No forged second log line survives — everything collapses onto one line.
        assertThat(out).isEqualTo("userADMIN login succeeded");
    }

    @Test
    public void sanitizeForLog_null_returnsNull() {
        assertThat(ModuleManagementCommunityServiceImpl.sanitizeForLog(null)).isNull();
    }

    @Test
    public void getProvisioningFilename_insertsTodaysDateBeforeExtension() {
        String name = ModuleManagementCommunityServiceImpl
                .getProvisioningFilenameWithDateAndExtension("module-management-community.yaml", ".yaml");

        assertThat(name).matches("module-management-community-\\d{4}-\\d{2}-\\d{2}\\.yaml");
    }

    @Test
    public void getProvisioningFilename_clusterSynchronizedVariant() {
        String name = ModuleManagementCommunityServiceImpl.getProvisioningFilenameWithDateAndExtension(
                ModuleManagementCommunityServiceImpl.CLUSTER_SYNCHRONIZED_YAML_SKIPPED, ".clusterSynchronized");

        // The date is inserted before the ".clusterSynchronized" segment.
        assertThat(name).contains(".clusterSynchronized");
        assertThat(name).matches(".*-\\d{4}-\\d{2}-\\d{2}\\.clusterSynchronized.*");
    }
}
