package org.jahia.support.modulemanagement.services;

import org.jahia.services.content.JCRTemplate;
import org.junit.Before;
import org.junit.Test;

import java.io.IOException;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;

/**
 * S9 — {@code installBundleVersionFromJcr} rejects client-supplied JCR paths that fall outside the
 * managed bundle store, or are too short to derive coordinates from, BEFORE any JCR read.
 * Security-critical (U15): the method installs a JCR binary as an OSGi bundle, so an attacker must
 * not be able to point it at an arbitrary node.
 */
public class JcrBundleInstallTest {

    private ModuleManagementCommunityServiceImpl service;
    private JCRTemplate jcrTemplate;

    @Before
    public void setUp() {
        service = new ModuleManagementCommunityServiceImpl();
        // Package-private @Reference field — a rejection must never reach the JCR read.
        jcrTemplate = mock(JCRTemplate.class);
        service.jcrTemplate = jcrTemplate;
    }

    @Test
    public void nullPath_rejectedBeforeJcrRead() {
        assertThatThrownBy(() -> service.installBundleVersionFromJcr(null))
                .isInstanceOf(IOException.class)
                .hasMessageContaining("must be located under");
        verifyNoInteractions(jcrTemplate);
    }

    @Test
    public void pathOutsideAllowlist_rejectedBeforeJcrRead() {
        assertThatThrownBy(() -> service.installBundleVersionFromJcr("/sites/evil/x.jar"))
                .isInstanceOf(IOException.class)
                .hasMessageContaining("must be located under");
        verifyNoInteractions(jcrTemplate);
    }

    @Test
    public void relativeTraversalPath_rejectedBeforeJcrRead() {
        assertThatThrownBy(() -> service.installBundleVersionFromJcr("../../etc/x.jar"))
                .isInstanceOf(IOException.class)
                .hasMessageContaining("must be located under");
        verifyNoInteractions(jcrTemplate);
    }

    @Test
    public void underAllowlistButTooShort_rejectedBeforeJcrRead() {
        // Starts with the base path but cannot yield {group}/{symbolicName}/{version}/{file}.
        assertThatThrownBy(() -> service.installBundleVersionFromJcr("/module-management/bundles/x"))
                .isInstanceOf(IOException.class)
                .hasMessageContaining("Cannot derive bundle coordinates");
        verifyNoInteractions(jcrTemplate);
    }
}
