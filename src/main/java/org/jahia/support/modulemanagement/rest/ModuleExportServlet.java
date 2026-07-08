package org.jahia.support.modulemanagement.rest;

import org.apache.commons.io.FileUtils;
import org.jahia.services.securityfilter.PermissionService;
import org.jahia.services.usermanager.JahiaUser;
import org.jahia.support.modulemanagement.ExportOptions;
import org.jahia.support.modulemanagement.ModuleManagementCommunityService;
import org.osgi.service.component.annotations.Activate;
import org.osgi.service.component.annotations.Component;
import org.osgi.service.component.annotations.Reference;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import javax.servlet.Servlet;
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
public class ModuleExportServlet extends AbstractModuleManagementServlet {

    private static final Logger logger = LoggerFactory.getLogger(ModuleExportServlet.class);
    private static final int BUFFER_SIZE = 65536;
    private static final String ERROR_EXPORT_FAILED = "{\"error\":\"Export failed\"}";

    private final transient ModuleManagementCommunityService moduleManagementCommunityService;

    @Activate
    public ModuleExportServlet(
            @Reference ModuleManagementCommunityService moduleManagementCommunityService,
            @Reference PermissionService permissionService) {
        super(permissionService);
        this.moduleManagementCommunityService = moduleManagementCommunityService;
    }

    @Override
    protected void doGet(HttpServletRequest request, HttpServletResponse response) {
        try {
            JahiaUser currentUser = checkAuthorized(request, response, "module-management-community.export");
            if (currentUser == null) {
                return;
            }
            ServletSupport.applyCorsHeaders(request, response);
            streamExport(request, response, currentUser);
        } catch (IOException e) {
            logger.error("Unexpected I/O error handling module export", e);
            if (!response.isCommitted()) {
                response.setStatus(HttpServletResponse.SC_INTERNAL_SERVER_ERROR);
            }
        }
    }

    private void streamExport(HttpServletRequest request, HttpServletResponse response, JahiaUser currentUser) {
        File zipFile = null;
        try {
            String typesParam = request.getParameter("types");
            // embedAll defaults to true — produce a self-contained archive by default
            boolean embedAll = !"false".equalsIgnoreCase(request.getParameter("embedAll"));
            ExportOptions options = ExportOptions.fromParams(typesParam, embedAll);

            if (logger.isInfoEnabled()) {
                logger.info("Module export requested by '{}' for types: {}",
                        ServletSupport.sanitizeForLog(currentUser.getName()), options.getTypes());
            }
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
            // Detail is logged server-side only; clients get a generic message (no internal leak).
            logger.error("Error generating module export archive", e);
            if (!response.isCommitted()) {
                response.setStatus(HttpServletResponse.SC_INTERNAL_SERVER_ERROR);
                response.setContentType(ServletSupport.CONTENT_TYPE_JSON);
                try {
                    response.getOutputStream().write(ERROR_EXPORT_FAILED.getBytes(StandardCharsets.UTF_8));
                } catch (IOException ioe) {
                    logger.error("Failed to write export error response", ioe);
                }
            }
        } finally {
            FileUtils.deleteQuietly(zipFile);
        }
    }

    @Override
    protected void doOptions(HttpServletRequest request, HttpServletResponse response) {
        handleOptions(request, response, "GET, OPTIONS");
    }
}
