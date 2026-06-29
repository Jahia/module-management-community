package org.jahia.support.modulemanagement.rest;

import org.jahia.params.valves.AuthValveContext;
import org.jahia.services.content.JCRSessionFactory;
import org.jahia.services.securityfilter.PermissionService;
import org.jahia.services.usermanager.JahiaUser;
import org.jahia.services.usermanager.JahiaUserManagerService;

import javax.annotation.Nullable;
import javax.jcr.RepositoryException;
import javax.servlet.http.HttpServlet;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.io.PrintWriter;
import java.nio.charset.StandardCharsets;
import org.slf4j.Logger;

/**
 * Common base for the module-management REST servlets.
 *
 * <p>Centralises the behaviour that every endpoint shares — CORS/Origin handling, the
 * {@code OPTIONS} pre-flight response, the authentication + permission check and the generic
 * JSON error responses — so the concrete servlets only carry their endpoint-specific logic.
 *
 * <p>The injected collaborators are {@code final} and supplied via OSGi Declarative Services R6
 * constructor injection by the concrete subclasses, so servlet instances hold no mutable shared
 * state.
 */
abstract class AbstractModuleManagementServlet extends HttpServlet {

    private final transient PermissionService permissionService;

    protected AbstractModuleManagementServlet(PermissionService permissionService) {
        this.permissionService = permissionService;
    }

    /** Body of a multipart POST handler, invoked once the request is authenticated and validated. */
    @FunctionalInterface
    protected interface MultipartHandler {
        void handle(HttpServletRequest request, HttpServletResponse response, PrintWriter writer, JahiaUser currentUser)
                throws IOException;
    }

    /**
     * Runs the request shape shared by every multipart POST endpoint: sets the JSON content type,
     * reflects CORS headers, enforces authentication for {@code permission}, requires a
     * {@code multipart/form-data} body and then delegates to {@code handler}. The shared I/O error
     * handling is applied around the whole flow. Centralised here so the concrete servlets do not
     * duplicate this boilerplate.
     */
    protected void handleMultipartPost(HttpServletRequest request, HttpServletResponse response,
                                       String permission, Logger logger, MultipartHandler handler) {
        try {
            response.setContentType(ServletSupport.CONTENT_TYPE_JSON);
            response.setCharacterEncoding("UTF-8");
            ServletSupport.applyCorsHeaders(request, response);

            JahiaUser currentUser = checkAuthorized(request, response, permission);
            if (currentUser == null) {
                return;
            }

            PrintWriter writer = response.getWriter();
            if (!org.apache.commons.fileupload.servlet.ServletFileUpload.isMultipartContent(request)) {
                response.setStatus(HttpServletResponse.SC_BAD_REQUEST);
                writer.write(ServletSupport.ERROR_MULTIPART_REQUIRED);
                return;
            }

            handler.handle(request, response, writer, currentUser);
        } catch (IOException e) {
            logger.error("Unexpected I/O error handling multipart request", e);
            if (!response.isCommitted()) {
                response.setStatus(HttpServletResponse.SC_INTERNAL_SERVER_ERROR);
            }
        }
    }

    /**
     * Verifies that the request comes from a non-guest, non-session authenticated user that holds
     * {@code permission}. On failure writes the generic auth error to {@code response} and returns
     * {@code null}; on success returns the authenticated {@link JahiaUser}.
     */
    @Nullable
    protected JahiaUser checkAuthorized(HttpServletRequest request, HttpServletResponse response, String permission)
            throws IOException {
        JahiaUser currentUser = JCRSessionFactory.getInstance().getCurrentUser();
        AuthValveContext ctx = (AuthValveContext) request.getAttribute(AuthValveContext.class.getName());
        if (currentUser == null || JahiaUserManagerService.isGuest(currentUser)
                || ctx == null || ctx.isAuthRetrievedFromSession()) {
            writeAuthRequired(response);
            return null;
        }
        try {
            if (!permissionService.hasPermission(permission)) {
                writeAuthRequired(response);
                return null;
            }
        } catch (RepositoryException e) {
            writeAuthRequired(response);
            return null;
        }
        return currentUser;
    }

    /** Writes the {@code 401} generic auth error as JSON to {@code response}. */
    protected void writeAuthRequired(HttpServletResponse response) throws IOException {
        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        response.setContentType(ServletSupport.CONTENT_TYPE_JSON);
        response.getOutputStream().write(ServletSupport.ERROR_AUTH_REQUIRED.getBytes(StandardCharsets.UTF_8));
    }

    /**
     * Reflects same-origin CORS headers and answers the {@code OPTIONS} pre-flight with the HTTP
     * methods this endpoint supports.
     *
     * @param allowMethods the {@code Access-Control-Allow-Methods} value (e.g. {@code "POST, OPTIONS"})
     */
    protected void handleOptions(HttpServletRequest request, HttpServletResponse response, String allowMethods) {
        ServletSupport.applyCorsHeaders(request, response);
        response.setHeader("Access-Control-Allow-Methods", allowMethods);
        response.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Requested-With");
        response.setStatus(HttpServletResponse.SC_OK);
    }
}
