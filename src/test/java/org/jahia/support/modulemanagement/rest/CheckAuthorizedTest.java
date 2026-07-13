package org.jahia.support.modulemanagement.rest;

import org.jahia.params.valves.AuthValveContext;
import org.jahia.services.content.JCRSessionFactory;
import org.jahia.services.securityfilter.PermissionService;
import org.jahia.services.usermanager.JahiaUser;
import org.jahia.services.usermanager.JahiaUserManagerService;
import org.junit.Test;
import org.mockito.MockedStatic;

import javax.servlet.ServletOutputStream;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.mockStatic;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * S17 — {@code AbstractModuleManagementServlet.checkAuthorized} rejects null user / guest / a null
 * auth context / an authenticated user lacking the required API-scope permission, and accepts any
 * non-guest authenticated user that holds it — including session-derived auth, which is the module's
 * own same-origin admin-UI mechanism ({@code credentials: 'same-origin'}). Security-critical (U9).
 *
 * <p>Finding #3 fix: the previous blanket rejection of session-derived auth blocked the UI's only
 * call path while adding no security — the API scope is {@code auto_apply: origin: hosted} and
 * constrained by {@code provisioningAccess}, so it already gates on same-origin + permission. CSRF is
 * therefore defended by the scope, not by refusing session cookies.
 */
public class CheckAuthorizedTest {

    /** Minimal concrete servlet so the abstract base can be instantiated. */
    private static final class TestServlet extends AbstractModuleManagementServlet {
        TestServlet(PermissionService permissionService) {
            super(permissionService);
        }
    }

    private static final String PERM = "module-management-community.upload";

    private HttpServletResponse mockResponse() throws Exception {
        HttpServletResponse resp = mock(HttpServletResponse.class);
        when(resp.getOutputStream()).thenReturn(mock(ServletOutputStream.class));
        return resp;
    }

    private HttpServletRequest requestWithCtx(AuthValveContext ctx) {
        HttpServletRequest req = mock(HttpServletRequest.class);
        when(req.getAttribute(AuthValveContext.class.getName())).thenReturn(ctx);
        return req;
    }

    @Test
    public void nullUser_rejectedWith401() throws Exception {
        PermissionService perm = mock(PermissionService.class);
        TestServlet servlet = new TestServlet(perm);
        HttpServletResponse resp = mockResponse();
        HttpServletRequest req = requestWithCtx(mock(AuthValveContext.class));

        try (MockedStatic<JCRSessionFactory> sf = mockStatic(JCRSessionFactory.class)) {
            JCRSessionFactory factory = mock(JCRSessionFactory.class);
            when(factory.getCurrentUser()).thenReturn(null);
            sf.when(JCRSessionFactory::getInstance).thenReturn(factory);

            JahiaUser result = servlet.checkAuthorized(req, resp, PERM);

            assertThat(result).isNull();
            verify(resp).setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        }
    }

    @Test
    public void guestUser_rejectedWith401() throws Exception {
        PermissionService perm = mock(PermissionService.class);
        TestServlet servlet = new TestServlet(perm);
        HttpServletResponse resp = mockResponse();
        JahiaUser guest = mock(JahiaUser.class);
        HttpServletRequest req = requestWithCtx(mock(AuthValveContext.class));

        try (MockedStatic<JCRSessionFactory> sf = mockStatic(JCRSessionFactory.class);
             MockedStatic<JahiaUserManagerService> um = mockStatic(JahiaUserManagerService.class)) {
            JCRSessionFactory factory = mock(JCRSessionFactory.class);
            when(factory.getCurrentUser()).thenReturn(guest);
            sf.when(JCRSessionFactory::getInstance).thenReturn(factory);
            um.when(() -> JahiaUserManagerService.isGuest(guest)).thenReturn(true);

            JahiaUser result = servlet.checkAuthorized(req, resp, PERM);

            assertThat(result).isNull();
            verify(resp).setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        }
    }

    @Test
    public void nullAuthContext_rejectedWith401() throws Exception {
        PermissionService perm = mock(PermissionService.class);
        TestServlet servlet = new TestServlet(perm);
        HttpServletResponse resp = mockResponse();
        JahiaUser user = mock(JahiaUser.class);
        HttpServletRequest req = requestWithCtx(null); // no AuthValveContext attribute

        try (MockedStatic<JCRSessionFactory> sf = mockStatic(JCRSessionFactory.class);
             MockedStatic<JahiaUserManagerService> um = mockStatic(JahiaUserManagerService.class)) {
            JCRSessionFactory factory = mock(JCRSessionFactory.class);
            when(factory.getCurrentUser()).thenReturn(user);
            sf.when(JCRSessionFactory::getInstance).thenReturn(factory);
            um.when(() -> JahiaUserManagerService.isGuest(user)).thenReturn(false);

            JahiaUser result = servlet.checkAuthorized(req, resp, PERM);

            assertThat(result).isNull();
            verify(resp).setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        }
    }

    @Test
    public void sessionDerivedAuthWithPermission_accepted() throws Exception {
        // Finding #3: session-derived auth (the admin UI's same-origin cookie call) is now accepted
        // when the caller holds the origin-scoped, provisioningAccess-constrained API scope. It must
        // NOT be rejected merely for being session-derived.
        PermissionService perm = mock(PermissionService.class);
        when(perm.hasPermission(anyString())).thenReturn(true);
        TestServlet servlet = new TestServlet(perm);
        HttpServletResponse resp = mockResponse();
        JahiaUser user = mock(JahiaUser.class);
        AuthValveContext ctx = mock(AuthValveContext.class);
        when(ctx.isAuthRetrievedFromSession()).thenReturn(true);
        HttpServletRequest req = requestWithCtx(ctx);

        try (MockedStatic<JCRSessionFactory> sf = mockStatic(JCRSessionFactory.class);
             MockedStatic<JahiaUserManagerService> um = mockStatic(JahiaUserManagerService.class)) {
            JCRSessionFactory factory = mock(JCRSessionFactory.class);
            when(factory.getCurrentUser()).thenReturn(user);
            sf.when(JCRSessionFactory::getInstance).thenReturn(factory);
            um.when(() -> JahiaUserManagerService.isGuest(user)).thenReturn(false);

            JahiaUser result = servlet.checkAuthorized(req, resp, PERM);

            assertThat(result).isSameAs(user);
            verify(resp, org.mockito.Mockito.never()).setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        }
    }

    @Test
    public void sessionDerivedAuthWithoutPermission_rejectedWith401() throws Exception {
        // A session-authenticated caller lacking the scope (e.g. cross-origin, so the hosted scope is
        // not applied, or no provisioningAccess) is still denied.
        PermissionService perm = mock(PermissionService.class);
        when(perm.hasPermission(anyString())).thenReturn(false);
        TestServlet servlet = new TestServlet(perm);
        HttpServletResponse resp = mockResponse();
        JahiaUser user = mock(JahiaUser.class);
        AuthValveContext ctx = mock(AuthValveContext.class);
        when(ctx.isAuthRetrievedFromSession()).thenReturn(true);
        HttpServletRequest req = requestWithCtx(ctx);

        try (MockedStatic<JCRSessionFactory> sf = mockStatic(JCRSessionFactory.class);
             MockedStatic<JahiaUserManagerService> um = mockStatic(JahiaUserManagerService.class)) {
            JCRSessionFactory factory = mock(JCRSessionFactory.class);
            when(factory.getCurrentUser()).thenReturn(user);
            sf.when(JCRSessionFactory::getInstance).thenReturn(factory);
            um.when(() -> JahiaUserManagerService.isGuest(user)).thenReturn(false);

            JahiaUser result = servlet.checkAuthorized(req, resp, PERM);

            assertThat(result).isNull();
            verify(resp).setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        }
    }

    @Test
    public void tokenAuthWithPermission_accepted() throws Exception {
        PermissionService perm = mock(PermissionService.class);
        when(perm.hasPermission(anyString())).thenReturn(true);
        TestServlet servlet = new TestServlet(perm);
        HttpServletResponse resp = mockResponse();
        JahiaUser user = mock(JahiaUser.class);
        AuthValveContext ctx = mock(AuthValveContext.class);
        when(ctx.isAuthRetrievedFromSession()).thenReturn(false);
        HttpServletRequest req = requestWithCtx(ctx);

        try (MockedStatic<JCRSessionFactory> sf = mockStatic(JCRSessionFactory.class);
             MockedStatic<JahiaUserManagerService> um = mockStatic(JahiaUserManagerService.class)) {
            JCRSessionFactory factory = mock(JCRSessionFactory.class);
            when(factory.getCurrentUser()).thenReturn(user);
            sf.when(JCRSessionFactory::getInstance).thenReturn(factory);
            um.when(() -> JahiaUserManagerService.isGuest(user)).thenReturn(false);

            JahiaUser result = servlet.checkAuthorized(req, resp, PERM);

            assertThat(result).isSameAs(user);
            verify(resp, org.mockito.Mockito.never()).setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        }
    }

    @Test
    public void authenticatedButLacksPermission_rejectedWith401() throws Exception {
        PermissionService perm = mock(PermissionService.class);
        when(perm.hasPermission(anyString())).thenReturn(false);
        TestServlet servlet = new TestServlet(perm);
        HttpServletResponse resp = mockResponse();
        JahiaUser user = mock(JahiaUser.class);
        AuthValveContext ctx = mock(AuthValveContext.class);
        when(ctx.isAuthRetrievedFromSession()).thenReturn(false);
        HttpServletRequest req = requestWithCtx(ctx);

        try (MockedStatic<JCRSessionFactory> sf = mockStatic(JCRSessionFactory.class);
             MockedStatic<JahiaUserManagerService> um = mockStatic(JahiaUserManagerService.class)) {
            JCRSessionFactory factory = mock(JCRSessionFactory.class);
            when(factory.getCurrentUser()).thenReturn(user);
            sf.when(JCRSessionFactory::getInstance).thenReturn(factory);
            um.when(() -> JahiaUserManagerService.isGuest(user)).thenReturn(false);

            JahiaUser result = servlet.checkAuthorized(req, resp, PERM);

            assertThat(result).isNull();
            verify(resp).setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        }
    }
}
