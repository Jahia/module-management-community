package org.jahia.support.modulemanagement.rest;

import org.apache.commons.fileupload.FileItemIterator;
import org.apache.commons.fileupload.FileItemStream;
import org.apache.commons.fileupload.FileUploadException;
import org.apache.commons.fileupload.servlet.ServletFileUpload;
import org.jahia.params.valves.AuthValveContext;
import org.jahia.services.content.JCRSessionFactory;
import org.jahia.services.securityfilter.PermissionService;
import org.jahia.services.usermanager.JahiaUser;
import org.jahia.services.usermanager.JahiaUserManagerService;
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
import java.io.IOException;
import java.io.InputStream;
import java.io.PrintWriter;

/**
 * HTTP servlet that handles JAR file uploads for module deployment
 * and YAML provisioning script uploads for direct execution.
 * Registered at /module-management-community/upload via OSGi HTTP Service.
 */
@Component(
        service = Servlet.class,
        property = {"alias=/module-management-community/upload"},
        immediate = true
)
public class ModuleUploadServlet extends HttpServlet {

    private static final Logger logger = LoggerFactory.getLogger(ModuleUploadServlet.class);
    private static final long MAX_FILE_SIZE = 150 * 1024 * 1024L; // 150 MB

    @Reference
    private ModuleManagementCommunityService moduleManagementCommunityService;

    @Reference
    private PermissionService permissionService;

    @Override
    protected void doPost(HttpServletRequest request, HttpServletResponse response) throws IOException {
        response.setContentType("application/json");
        response.setCharacterEncoding("UTF-8");
        // Allow the admin SPA (same origin) to call this endpoint
        String origin = request.getHeader("Origin");
        if (origin != null) {
            response.setHeader("Access-Control-Allow-Origin", origin);
            response.setHeader("Vary", "Origin");
        }

        PrintWriter writer = response.getWriter();

        // --- Authentication check ---
        JahiaUser currentUser = JCRSessionFactory.getInstance().getCurrentUser();
        AuthValveContext ctx = (AuthValveContext) request.getAttribute(AuthValveContext.class.getName());
        if (currentUser == null || JahiaUserManagerService.isGuest(currentUser) || ctx == null || ctx.isAuthRetrievedFromSession()) {
            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            writer.write("{\"error\":\"Authentication required\"}");
            return;
        }

        try {
            if(!permissionService.hasPermission("module-management-community.upload")) {
                response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
                writer.write("{\"error\":\"Authentication required\"}");
                return;
            }
        } catch (RepositoryException e) {
            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            writer.write("{\"error\":\"Authentication required\"}");
            return;
        }

        // --- Multipart check ---
        if (!ServletFileUpload.isMultipartContent(request)) {
            response.setStatus(HttpServletResponse.SC_BAD_REQUEST);
            writer.write("{\"error\":\"Multipart request required\"}");
            return;
        }

        // --- Parse upload ---
        try {
            ServletFileUpload upload = new ServletFileUpload();
            upload.setFileSizeMax(MAX_FILE_SIZE);

            FileItemIterator iterator = upload.getItemIterator(request);
            while (iterator.hasNext()) {
                FileItemStream item = iterator.next();
                if (!item.isFormField() && "file".equals(item.getFieldName())) {
                    String fileName = sanitizeFileName(item.getName());
                    String lowerName = fileName.toLowerCase();
                    logger.info("Received upload request for file: {} by user: {}", fileName, currentUser.getName());

                    try (InputStream stream = item.openStream()) {
                        String result;
                        if (lowerName.endsWith(".yaml") || lowerName.endsWith(".yml")) {
                            result = moduleManagementCommunityService.applyProvisioningYaml(stream, fileName);
                        } else {
                            result = moduleManagementCommunityService.deployUploadedModule(stream, fileName);
                        }
                        writer.write("{\"message\":" + toJsonString(result) + "}");
                    }
                    return;
                }
            }

            response.setStatus(HttpServletResponse.SC_BAD_REQUEST);
            writer.write("{\"error\":\"No 'file' field found in the multipart request\"}");

        } catch (FileUploadException e) {
            logger.error("Error parsing multipart upload", e);
            response.setStatus(HttpServletResponse.SC_BAD_REQUEST);
            writer.write("{\"error\":" + toJsonString(e.getMessage()) + "}");
        } catch (IOException e) {
            String lowerMsg = e.getMessage() != null ? e.getMessage().toLowerCase() : "";
            boolean isYamlError = lowerMsg.contains("provisioning") || lowerMsg.contains("yaml");
            if (isYamlError) {
                logger.error("Error executing provisioning YAML upload", e);
            } else {
                logger.error("Error deploying uploaded module", e);
            }
            response.setStatus(HttpServletResponse.SC_INTERNAL_SERVER_ERROR);
            writer.write("{\"error\":" + toJsonString(e.getMessage()) + "}");
        }
    }

    @Override
    protected void doOptions(HttpServletRequest request, HttpServletResponse response) {
        String origin = request.getHeader("Origin");
        if (origin != null) {
            response.setHeader("Access-Control-Allow-Origin", origin);
            response.setHeader("Vary", "Origin");
        }
        response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
        response.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Requested-With");
        response.setStatus(HttpServletResponse.SC_OK);
    }

    /** Strips directory components from the file name supplied by the browser. */
    private String sanitizeFileName(String raw) {
        if (raw == null) {
            return "upload.jar";
        }
        // Remove Windows and Unix path separators
        int lastSlash = Math.max(raw.lastIndexOf('/'), raw.lastIndexOf('\\'));
        return lastSlash >= 0 ? raw.substring(lastSlash + 1) : raw;
    }

    /** Minimal JSON string escaping — avoids a JSON library dependency. */
    private String toJsonString(String value) {
        if (value == null) {
            return "null";
        }
        return "\"" + value
                .replace("\\", "\\\\")
                .replace("\"", "\\\"")
                .replace("\n", "\\n")
                .replace("\r", "\\r")
                .replace("\t", "\\t") + "\"";
    }
}

