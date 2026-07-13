package org.jahia.support.modulemanagement.graphql;

import org.jahia.services.content.JCRNodeWrapper;
import org.jahia.services.content.JCRSessionFactory;
import org.jahia.services.content.JCRSessionWrapper;
import org.junit.Test;
import org.mockito.MockedStatic;

import javax.jcr.RepositoryException;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.mockStatic;
import static org.mockito.Mockito.when;

/**
 * D2 — {@link ProvisioningAccessGuard} enforces the {@code provisioningAccess} JCR permission at the
 * repository root ({@code /}) for the Module Management provisioning GraphQL API. This is the in-code
 * gate that the declarative security-filter scope cannot provide (additive merge cannot restrict
 * below the {@code graphqlAdminQuery}/{@code graphqlAdminMutation} baseline).
 *
 * <p>The before/after inversion proven live: a caller holding {@code graphqlAdminMutation} but NOT
 * {@code provisioningAccess} was ALLOWED before this guard and is DENIED after it.
 */
public class ProvisioningAccessGuardTest {

    private void withRootPermission(boolean granted, Runnable body) {
        try (MockedStatic<JCRSessionFactory> sf = mockStatic(JCRSessionFactory.class)) {
            JCRSessionFactory factory = mock(JCRSessionFactory.class);
            JCRSessionWrapper session = mock(JCRSessionWrapper.class);
            JCRNodeWrapper root = mock(JCRNodeWrapper.class);
            sf.when(JCRSessionFactory::getInstance).thenReturn(factory);
            try {
                when(factory.getCurrentUserSession()).thenReturn(session);
                when(session.getNode("/")).thenReturn(root);
                when(root.hasPermission(ProvisioningAccessGuard.PROVISIONING_ACCESS)).thenReturn(granted);
            } catch (RepositoryException e) {
                throw new IllegalStateException(e);
            }
            body.run();
        }
    }

    @Test
    public void enforce_userWithProvisioningAccess_passes() {
        withRootPermission(true, () ->
                assertThatCode(ProvisioningAccessGuard::enforce).doesNotThrowAnyException());
    }

    @Test
    public void enforce_userWithoutProvisioningAccess_denied() {
        // The D2 negative: a partial admin (no provisioningAccess) is denied.
        withRootPermission(false, () ->
                assertThatThrownBy(ProvisioningAccessGuard::enforce)
                        .isInstanceOf(ProvisioningAccessDeniedException.class));
    }

    @Test
    public void enforce_nullSession_denied() throws RepositoryException {
        try (MockedStatic<JCRSessionFactory> sf = mockStatic(JCRSessionFactory.class)) {
            JCRSessionFactory factory = mock(JCRSessionFactory.class);
            sf.when(JCRSessionFactory::getInstance).thenReturn(factory);
            when(factory.getCurrentUserSession()).thenReturn(null);

            assertThatThrownBy(ProvisioningAccessGuard::enforce)
                    .isInstanceOf(ProvisioningAccessDeniedException.class);
        }
    }

    @Test
    public void enforce_repositoryException_denied() {
        try (MockedStatic<JCRSessionFactory> sf = mockStatic(JCRSessionFactory.class)) {
            JCRSessionFactory factory = mock(JCRSessionFactory.class);
            JCRSessionWrapper session = mock(JCRSessionWrapper.class);
            sf.when(JCRSessionFactory::getInstance).thenReturn(factory);
            try {
                when(factory.getCurrentUserSession()).thenReturn(session);
                when(session.getNode("/")).thenThrow(new RepositoryException("boom"));
            } catch (RepositoryException e) {
                throw new IllegalStateException(e);
            }

            assertThatThrownBy(ProvisioningAccessGuard::enforce)
                    .isInstanceOf(ProvisioningAccessDeniedException.class);
        }
    }
}
