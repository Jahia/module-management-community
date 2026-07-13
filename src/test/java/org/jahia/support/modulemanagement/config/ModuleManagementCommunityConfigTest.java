package org.jahia.support.modulemanagement.config;

import org.junit.Test;

import java.io.InputStream;
import java.util.Properties;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * S22 — OSGi config annotation defaults, and the values in the shipped default {@code .cfg}.
 * U2. The annotation defaults are read reflectively (they are what the OSGi metatype exposes when
 * no config is supplied); the {@code .cfg} overrides are parsed from the real resource on classpath.
 */
public class ModuleManagementCommunityConfigTest {

    private static final String CFG_RESOURCE =
            "/META-INF/configurations/org.jahia.support.modulemanagement.services.ModuleManagementCommunityService.cfg";

    @Test
    public void annotationDefaults_matchDocumentedValues() throws Exception {
        Class<ModuleManagementCommunityConfig> c = ModuleManagementCommunityConfig.class;

        assertThat(c.getMethod("updateOnModuleStartup").getDefaultValue()).isEqualTo(true);
        assertThat(c.getMethod("excludedModules").getDefaultValue()).isEqualTo("");
        assertThat(c.getMethod("maxModulesToUpdate").getDefaultValue()).isEqualTo(10);
        assertThat(c.getMethod("refreshModuleUpdatesInBackgroundCron").getDefaultValue())
                .isEqualTo("0 0 2 * * ?");
        assertThat((String) c.getMethod("storeModuleListUrl").getDefaultValue())
                .contains("store.jahia.com").contains("moduleList.json");
    }

    @Test
    public void shippedCfg_overridesResolveCorrectly() throws Exception {
        Properties props = new Properties();
        try (InputStream in = getClass().getResourceAsStream(CFG_RESOURCE)) {
            assertThat(in).as("shipped default .cfg on classpath").isNotNull();
            props.load(in);
        }

        assertThat(props.getProperty("updateOnModuleStartup")).isEqualTo("false");
        assertThat(props.getProperty("excludedModules")).isEqualTo("org.apache.karaf, org.apache.felix");
        assertThat(props.getProperty("maxModulesToUpdate")).isEqualTo("10");
    }

    @Test
    public void shippedCfg_startsWithDefaultConfigMarker() throws Exception {
        // Jahia's module extender overwrites the deployed karaf/etc file on every start UNLESS the
        // .cfg begins with this exact marker line — regression guard for that convention.
        try (InputStream in = getClass().getResourceAsStream(CFG_RESOURCE)) {
            assertThat(in).isNotNull();
            String content = new String(in.readAllBytes(), java.nio.charset.StandardCharsets.UTF_8);
            assertThat(content).startsWith("# default configuration - won't be overridden");
        }
    }
}
