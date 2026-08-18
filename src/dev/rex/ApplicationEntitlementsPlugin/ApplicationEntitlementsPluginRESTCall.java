package dev.rex.ApplicationEntitlementsPlugin;

import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Map;

import javax.ws.rs.Consumes;
import javax.ws.rs.DefaultValue;
import javax.ws.rs.GET;
import javax.ws.rs.Path;
import javax.ws.rs.Produces;
import javax.ws.rs.QueryParam;
import javax.ws.rs.core.MediaType;

import sailpoint.api.SailPointContext;
import sailpoint.object.Application;
import sailpoint.object.Filter;
import sailpoint.object.ManagedAttribute;
import sailpoint.object.QueryOptions;
import sailpoint.rest.plugin.AllowAll;
import sailpoint.rest.plugin.BasePluginResource;
import sailpoint.tools.Util;

@Path("ApplicationEntitlementsPlugin")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
public class ApplicationEntitlementsPluginRESTCall extends BasePluginResource {

    @Override
    public String getPluginName() {
        return "ApplicationEntitlementsPlugin";
    }
    
    @GET
    @Path("applicationName")
    @Produces(MediaType.APPLICATION_JSON)
    @AllowAll
    public Map<String, String> getApplicationName(@QueryParam("applicationId") String applicationId) throws Exception {
        Map<String, String> responseMap = new HashMap<>();
        String applicationName = "";
        if (Util.isNotNullOrEmpty(applicationId)) {
            SailPointContext context = getContext();
            Application appObj = context.getObject(Application.class, applicationId);
            if (appObj != null) {
                responseMap.put("applicationName", appObj.getName());
            }
        }
        return responseMap;
    }

    @GET
    @Path("entitlementAttributeTypes")
    @Produces(MediaType.APPLICATION_JSON)
    @AllowAll
    public Map<String, Object> getEntitlementAttributeTypes(@QueryParam("applicationId") String applicationId) throws Exception {

        Map<String, Object> responseMap = new HashMap<String, Object>();

        if (Util.isNotNullOrEmpty(applicationId)) {
            SailPointContext context = getContext();
            List<String> entitlementAttributeTypes = null;
            
            Application appObj = context.getObject(Application.class, applicationId);
            if (appObj != null) {
                //Get the Entitlement Attribute Types for the given Application ID...
                if (appObj.getEntitlementAttributeNames() != null && !appObj.getEntitlementAttributeNames().isEmpty()) {
                    entitlementAttributeTypes = new ArrayList<>(appObj.getEntitlementAttributeNames());
                    
                    Collections.sort(entitlementAttributeTypes);

                    responseMap.put("attributeTypes", entitlementAttributeTypes);
                }
            }
        }
        return responseMap;
    }

    @GET
    @Path("entitlements")
    @Produces(MediaType.APPLICATION_JSON)
    @AllowAll
    public Map<String, Object> getApplicationEntitlements(
                                @QueryParam("applicationId") String applicationId, 
                                @QueryParam("start") @DefaultValue("0") int start, 
                                @QueryParam("limit") @DefaultValue("25") int limit,
                                @QueryParam("q") String searchTerm,
                                @QueryParam("attributeType") String entitlementAttributeType) throws Exception {
        Map<String, Object> finalResponseMap = new HashMap<String, Object>();
        if (Util.isNotNullOrEmpty(applicationId)) {
            SailPointContext context = getContext();

            //The Filter used for Search Query provided by the user in the search box...
            Filter searchFilter = null;
            if (Util.isNotNullOrEmpty(searchTerm)) {
                searchTerm = searchTerm.trim();

                // Decode the search String to handle URL-encoded characters...
                searchTerm = URLDecoder.decode(searchTerm, StandardCharsets.UTF_8);
                searchFilter = Filter.or(
                    Filter.like("value", searchTerm, Filter.MatchMode.ANYWHERE),
                    Filter.like("displayName", searchTerm, Filter.MatchMode.ANYWHERE)
                );                    

                // Add Entitlement Attribute Type to search if needed...
                if (Util.isNotNullOrEmpty(entitlementAttributeType)) {
                    entitlementAttributeType = URLDecoder.decode(entitlementAttributeType, StandardCharsets.UTF_8);
                    searchFilter = Filter.and(searchFilter, Filter.eq("attribute", entitlementAttributeType));
                }         
            }

            QueryOptions applicationEntQueryOptions_BaseFilter = new QueryOptions();
            applicationEntQueryOptions_BaseFilter.addFilter(Filter.eq("application.id", applicationId));
            applicationEntQueryOptions_BaseFilter.setDistinct(true);

            int totalCountForJustAPrint = context.countObjects(ManagedAttribute.class, applicationEntQueryOptions_BaseFilter);

            QueryOptions applicationEntQueryOptions_PaginationFilter = new QueryOptions();
            applicationEntQueryOptions_PaginationFilter.addFilter(Filter.eq("application.id", applicationId));
            if (searchFilter != null) {
                applicationEntQueryOptions_PaginationFilter.addFilter(searchFilter);
            }

            // Add the entitlement attribute type filter if provided...
            if (Util.isNotNullOrEmpty(entitlementAttributeType)) {
                entitlementAttributeType = URLDecoder.decode(entitlementAttributeType, StandardCharsets.UTF_8);
                applicationEntQueryOptions_PaginationFilter.addFilter(Filter.eq("attribute", entitlementAttributeType));
            }
            applicationEntQueryOptions_PaginationFilter.setDistinct(true);
            applicationEntQueryOptions_PaginationFilter.setFirstRow(start);
            applicationEntQueryOptions_PaginationFilter.setResultLimit(limit);

            //Get the Actual Total Count of Managed Attributes based on the provided filters....
            int totalCount = context.countObjects(ManagedAttribute.class, applicationEntQueryOptions_PaginationFilter);

            Iterator<ManagedAttribute> applicationEntIterator = context.search(ManagedAttribute.class, applicationEntQueryOptions_PaginationFilter);

            if (context.countObjects(ManagedAttribute.class, applicationEntQueryOptions_PaginationFilter) > 0) {
                Map<String, Map<String, String>> entitlementsMap = new HashMap<String, Map<String, String>>();            
                while (applicationEntIterator.hasNext()) {
                    Map<String, String> eachEntitlementDetails = new HashMap<String, String>();

                    ManagedAttribute managedAttribute = applicationEntIterator.next();
                    String managedAttributeID = managedAttribute.getId();

                    //Get the values of each entitlement...
                    eachEntitlementDetails.put("managedAttributeID", managedAttribute.getId());
                    eachEntitlementDetails.put("attributeName", managedAttribute.getAttribute());
                    eachEntitlementDetails.put("entitlementDisplayName", managedAttribute.getDisplayableName());
                    eachEntitlementDetails.put("entitlementValue", (String) managedAttribute.getValue());

                    if (managedAttribute.getOwner() != null) {
                        eachEntitlementDetails.put("entitlementOwner", managedAttribute.getOwner().getDisplayableName());
                    } else {
                        eachEntitlementDetails.put("entitlementOwner", "");
                    }
                    eachEntitlementDetails.put("isRequestable", String.valueOf(managedAttribute.isRequestable()));
                    entitlementsMap.put(managedAttributeID, eachEntitlementDetails);
                }
                finalResponseMap.put("totalCount", totalCount);
                finalResponseMap.put("entitlements", entitlementsMap);
            }
        }
        return finalResponseMap;
    }
}