package org.jahia.support.modulemanagement.rest;

import org.apache.commons.io.FileUtils;
import org.jahia.params.valves.AuthValveContext;
import org.jahia.services.content.JCRSessionFactory;
import org.jahia.services.securityfilter.PermissionService;
import org.jahia.services.usermanager.JahiaUser;
import org.jahia.services.usermanager.JahiaUserManagerService;
import org.jahia.support.modulemanagement.ExportOptions;
import org.jahia.support.modulemanagement.ModuleManagementCommunityService;
import org.osgi.service.component.annotations.Component;
import org.osgi.service.component.annotations.Reference;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import javax.jcr.RepositoryException;
import javax.servlet.Servlet;
import javax.servlet.http.HttpServlet;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;

/**
 * HTTP GET servlet that streams a module snapshot ZIP archive.
 *
 * <p>Registered at {@code /module-management-community/export}.
 *
 * <h3>Query parameters</h3>
 * <ul>
 *   <li>{@code types} – comma-separated Jahia-Module-Type values to include
 *       (default: {@code module,system,templatesSet}).  Plain OSGi bundles are
 *       always excluded.</li>
 * </ul>
 */
@Component(
        service = Servlet.class,
        property = {"alias=/module-management-community/export"},
        immediate = true
)
public class ModuleExportServlet extends HttpServlet {

    private static final Logger logger = LoggerFactory.getLogger(ModuleExportServlet.class);
    private static final int BUFFER_SIZE = 65536;

    @Reference
    private ModuleManagementCommunityService moduleManagementCommunityService;

    @Reference
    private PermissionService permissionService;

    @Override
    protected void doGet(HttpServletRequest request, HttpServletResponse response) throws IOException {

        // --- Authentication check ---
        JahiaUser currentUser = JCRSessionFactory.getInstance().getCurrentUser();
        AuthValveContext ctx = (AuthValveContext) request.getAttribute(AuthValveContext.class.getName());
        if (currentUser == null || JahiaUserManagerService.isGuest(currentUser) || ctx == null || ctx.isAuthRetrievedFromSession()) {
            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            response.setContentType("application/json;charset=UTF-8");
            response.getOutputStream().write("{\"error\":\"Authentication required\"}".getBytes(StandardCharsets.UTF_8));
            return;
        }

        try {
            if(!permissionService.hasPermission("module-management-community.export")) {
                response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
                response.setContentType("application/json;charset=UTF-8");
                response.getOutputStream().write("{\"error\":\"Authentication required\"}".getBytes(StandardCharsets.UTF_8));
                return;
            }
        } catch (RepositoryException e) {
            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            response.setContentType("application/json;charset=UTF-8");
            response.getOutputStream().write("{\"error\":\"Authentication required\"}".getBytes(StandardCharsets.UTF_8));
            return;
        }

        // --- Allow admin SPA (same origin) to call via fetch ---
        String origin = request.getHeader("Origin");
        if (origin != null) {
            response.setHeader("Access-Control-Allow-Origin", origin);
            response.setHeader("Vary", "Origin");
        }

        File zipFile = null;
        try {
            String typesParam = request.getParameter("types");
            // embedAll defaults to true — produce a self-contained archive by default
            boolean embedAll = !"false".equalsIgnoreCase(request.getParameter("embedAll"));
            ExportOptions options = ExportOptions.fromParams(typesParam, embedAll);

            logger.info("Module export requested by '{}' for types: {}", currentUser.getName(), options.getTypes());
            zipFile = moduleManagementCommunityService.exportModulesArchive(options);

            String filename = "module-snapshot-" + LocalDate.now() + ".zip";
            response.setContentType("application/zip");
            response.setHeader("Content-Disposition", "attachment; filename=\"" + filename + "\"");
            response.setContentLengthLong(zipFile.length());
            response.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
            response.setHeader("Pragma", "no-cache");
            response.setIntHeader("Expires", 0);

            try (BufferedInputStream in = new BufferedInputStream(new FileInputStream(zipFile), BUFFER_SIZE)) {
                byte[] buffer = new byte[BUFFER_SIZE];
                int len;
                while ((len = in.read(buffer)) > 0) {
                    response.getOutputStream().write(buffer, 0, len);
                }
            }

        } catch (Exception e) {
            logger.error("Error generating module export archive", e);
            if (!response.isCommitted()) {
                response.setStatus(HttpServletResponse.SC_INTERNAL_SERVER_ERROR);
                response.setContentType("application/json;charset=UTF-8");
                String msg = e.getMessage() != null ? e.getMessage().replace("\"", "'") : "Unknown error";
                response.getOutputStream().write(("{\"error\":\"" + msg + "\"}").getBytes(StandardCharsets.UTF_8));
            }
        } finally {
            FileUtils.deleteQuietly(zipFile);
        }
    }

    @Override
    protected void doOptions(HttpServletRequest request, HttpServletResponse response) {
        String origin = request.getHeader("Origin");
        if (origin != null) {
            response.setHeader("Access-Control-Allow-Origin", origin);
            response.setHeader("Vary", "Origin");
        }
        response.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
        response.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Requested-With");
        response.setStatus(HttpServletResponse.SC_OK);
    }
}

